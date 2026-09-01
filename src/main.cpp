#include <algorithm>
#include <cmath>
#include <fstream>
#include <iostream>
#include <map>
#include <random>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

static json read_json(const std::string& path) {
    std::ifstream f(path);
    if (!f) throw std::runtime_error("Could not open " + path);
    json j;
    f >> j;
    return j;
}

static std::vector<std::string> split_csv(const std::string& s) {
    std::vector<std::string> out;
    std::stringstream ss(s);
    std::string item;
    while (std::getline(ss, item, ',')) {
        const auto first = item.find_first_not_of(" \t");
        if (first == std::string::npos) continue;
        const auto last = item.find_last_not_of(" \t");
        item = item.substr(first, last - first + 1);
        if (!item.empty()) out.push_back(item);
    }
    return out;
}

static std::vector<std::string> choose_random_meals(const json& meals_array, int count) {
    if (count <= 0) throw std::runtime_error("Random meal count must be greater than zero");
    if (count > static_cast<int>(meals_array.size()))
        throw std::runtime_error("Random meal count exceeds number of registered meals");

    std::vector<std::string> ids;
    ids.reserve(meals_array.size());
    for (const auto& meal : meals_array) ids.push_back(meal.at("id").get<std::string>());

    std::random_device rd;
    std::mt19937 rng(rd());
    std::shuffle(ids.begin(), ids.end(), rng);
    ids.resize(static_cast<std::size_t>(count));
    return ids;
}

int main(int argc, char** argv) {
    try {
        if (argc != 3 && argc != 4) {
            std::cerr << "usage:\n"
                      << "  mealplanner <comma-separated-meal-ids> <request-id>\n"
                      << "  mealplanner --random-count <count> <request-id>\n";
            return 2;
        }

        const json meals_db = read_json("data/meals.json");
        const json ingredients_db = read_json("data/ingredients.json").at("ingredients");

        std::vector<std::string> selected;
        std::string request_id;
        std::string selection_mode;

        if (argc == 4 && std::string(argv[1]) == "--random-count") {
            const int count = std::stoi(argv[2]);
            request_id = argv[3];
            selected = choose_random_meals(meals_db.at("meals"), count);
            selection_mode = "random";
        } else if (argc == 3) {
            selected = split_csv(argv[1]);
            request_id = argv[2];
            selection_mode = "explicit";
            if (selected.empty()) throw std::runtime_error("No meals selected");
        } else {
            throw std::runtime_error("Invalid arguments");
        }

        std::unordered_map<std::string, json> meals;
        for (const auto& m : meals_db.at("meals"))
            meals[m.at("id").get<std::string>()] = m;

        struct Qty {
            double quantity = 0.0;
            std::string unit;
        };

        std::map<std::string, Qty> totals;
        json selected_meals = json::array();
        json macro_totals = {
            {"calories_kcal", 0.0},
            {"protein_g", 0.0},
            {"carbs_g", 0.0},
            {"fat_g", 0.0}
        };

        for (const auto& id : selected) {
            if (!meals.contains(id)) throw std::runtime_error("Unknown meal id: " + id);
            const auto& meal = meals.at(id);
            selected_meals.push_back({{"id", id}, {"name", meal.at("name")}});

            for (const auto* key : {"calories_kcal", "protein_g", "carbs_g", "fat_g"})
                macro_totals[key] = macro_totals[key].get<double>() + meal.at("macros").at(key).get<double>();

            for (const auto& item : meal.at("buy")) {
                const std::string iid = item.at("ingredient_id");
                const std::string unit = item.at("unit");
                const double q = item.at("quantity");
                if (totals.contains(iid) && totals[iid].unit != unit)
                    throw std::runtime_error("Unit mismatch for " + iid);
                totals[iid].unit = unit;
                totals[iid].quantity += q;
            }
        }

        json shopping = json::array();
        for (const auto& [iid, q] : totals) {
            if (!ingredients_db.contains(iid))
                throw std::runtime_error("Missing ingredient metadata: " + iid);

            const auto& meta = ingredients_db.at(iid);
            const double pack_q = meta.at("pack_quantity");
            const std::string pack_unit = meta.at("pack_unit");
            if (pack_unit != q.unit) throw std::runtime_error("Pack unit mismatch for " + iid);

            const int packs = std::max(1, static_cast<int>(std::ceil(q.quantity / pack_q)));
            shopping.push_back({
                {"ingredient_id", iid},
                {"name", meta.at("name")},
                {"category", meta.at("category")},
                {"needed", q.quantity},
                {"unit", q.unit},
                {"pack_quantity", pack_q},
                {"pack_unit", pack_unit},
                {"packs", packs},
                {"buy_text", std::to_string(packs) + " x " + meta.at("name").get<std::string>()}
            });
        }

        std::sort(shopping.begin(), shopping.end(), [](const json& a, const json& b) {
            if (a.at("category") == b.at("category")) return a.at("name") < b.at("name");
            return a.at("category") < b.at("category");
        });

        json out = {
            {"request_id", request_id},
            {"selection_mode", selection_mode},
            {"selected_meals", selected_meals},
            {"shopping_list", shopping},
            {"macro_totals", macro_totals}
        };

        std::ofstream f("output/latest.json");
        if (!f) throw std::runtime_error("Could not create output/latest.json");
        f << out.dump(2) << '\n';
        std::cout << out.dump(2) << '\n';
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "error: " << e.what() << '\n';
        return 1;
    }
}
