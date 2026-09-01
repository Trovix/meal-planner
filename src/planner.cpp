#include "mealplanner/planner.hpp"
#include <algorithm>
#include <cmath>
#include <map>
#include <numeric>
#include <random>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

namespace mealplanner {
namespace {

struct Quantity {
    double value = 0.0;
    std::string unit;
};

const json& ingredient_catalogue(const json& root) {
    if (!root.contains("ingredients") || !root["ingredients"].is_object()) {
        throw std::runtime_error("ingredients.json must contain an ingredients object");
    }
    return root["ingredients"];
}

const json& pantry_catalogue(const json& root) {
    if (!root.contains("pantry") || !root["pantry"].is_object()) {
        throw std::runtime_error("pantry.json must contain a pantry object");
    }
    return root["pantry"];
}

std::set<std::string> validate_buy_items(
    const json& items,
    const json& ingredients,
    const std::string& field
) {
    if (!items.is_array() || items.empty()) {
        throw std::runtime_error(field + " must be a non-empty array");
    }
    std::set<std::string> seen;
    for (const auto& item : items) {
        if (!item.is_object() || !item.contains("ingredient_id") ||
            !item.contains("quantity") || !item.contains("unit")) {
            throw std::runtime_error("Every " + field + " item needs ingredient_id, quantity and unit");
        }
        const std::string id = item["ingredient_id"];
        const std::string unit = item["unit"];
        const double quantity = item["quantity"];
        if (quantity <= 0) {
            throw std::runtime_error("Ingredient quantity must be greater than zero: " + id);
        }
        if (!ingredients.contains(id)) {
            throw std::runtime_error("Unknown ingredient id: " + id);
        }
        if (!seen.insert(id).second) {
            throw std::runtime_error("Duplicate ingredient id in " + field + ": " + id);
        }
        if (ingredients.at(id)["pack_unit"].get<std::string>() != unit) {
            throw std::runtime_error("Unit mismatch for " + id);
        }
    }
    return seen;
}

void validate_substitutions(
    const json& recipe,
    const json& ingredients,
    const std::set<std::string>& buy_ids,
    const std::set<std::string>& pantry_ids
) {
    if (!recipe.contains("substitutions")) {
        return;
    }
    const auto& substitutions = recipe["substitutions"];
    if (!substitutions.is_array()) {
        throw std::runtime_error("Substitutions must be an array");
    }
    std::set<std::string> seen;
    for (const auto& substitution : substitutions) {
        if (!substitution.is_object() || !substitution.contains("id") ||
            !substitution.contains("label") || !substitution.contains("note") ||
            !substitution.contains("replaces") || !substitution.contains("buy")) {
            throw std::runtime_error("Every substitution needs id, label, note, replaces and buy");
        }
        const std::string id = substitution["id"];
        if (id.empty() || !seen.insert(id).second) {
            throw std::runtime_error("Substitution ids must be non-empty and unique");
        }
        if (!substitution["label"].is_string() || substitution["label"].get<std::string>().empty() ||
            !substitution["note"].is_string() || substitution["note"].get<std::string>().empty()) {
            throw std::runtime_error("Substitution label and note must be non-empty strings");
        }
        const auto& replaces = substitution["replaces"];
        if (!replaces.is_array() || replaces.empty()) {
            throw std::runtime_error("Substitution replaces must be a non-empty array");
        }
        std::set<std::string> replacement_ids;
        for (const auto& replacement : replaces) {
            const std::string replacement_id = replacement;
            if (!buy_ids.contains(replacement_id) || !replacement_ids.insert(replacement_id).second) {
                throw std::runtime_error("Substitution replaces an invalid ingredient: " + replacement_id);
            }
        }
        validate_buy_items(substitution["buy"], ingredients, "substitution buy");
        if (substitution.contains("omit_pantry")) {
            if (!substitution["omit_pantry"].is_array()) {
                throw std::runtime_error("Substitution omit_pantry must be an array");
            }
            std::set<std::string> omitted;
            for (const auto& pantry_id_json : substitution["omit_pantry"]) {
                const std::string pantry_id = pantry_id_json;
                if (!pantry_ids.contains(pantry_id) || !omitted.insert(pantry_id).second) {
                    throw std::runtime_error("Substitution omits an invalid pantry item: " + pantry_id);
                }
            }
        }
    }
}

void validate_recipe(const json& recipe, const json& ingredients, const json* pantry) {
    for (const auto* key : {"id", "name", "description", "servings", "active", "macros", "buy", "pantry", "instructions"}) {
        if (!recipe.contains(key)) {
            throw std::runtime_error(std::string("Recipe is missing '") + key + "'");
        }
    }
    if (!recipe["id"].is_string() || recipe["id"].get<std::string>().empty()) {
        throw std::runtime_error("Recipe id must be a non-empty string");
    }
    if (!recipe["name"].is_string() || recipe["name"].get<std::string>().empty()) {
        throw std::runtime_error("Recipe name must be a non-empty string");
    }
    if (!recipe["servings"].is_number_integer() || recipe["servings"].get<int>() < 1) {
        throw std::runtime_error("Recipe servings must be a positive integer");
    }
    if (!recipe["active"].is_boolean()) {
        throw std::runtime_error("Recipe active must be true or false");
    }
    for (const auto* key : {"calories_kcal", "protein_g", "carbs_g", "fat_g"}) {
        if (!recipe["macros"].contains(key) || !recipe["macros"][key].is_number() ||
            recipe["macros"][key].get<double>() < 0) {
            throw std::runtime_error(std::string("Invalid macro field: ") + key);
        }
    }

    const auto buy_ids = validate_buy_items(recipe["buy"], ingredients, "buy");
    if (!recipe["pantry"].is_array()) {
        throw std::runtime_error("Pantry must be an array");
    }
    std::set<std::string> pantry_ids;
    for (const auto& pantry_id_json : recipe["pantry"]) {
        const std::string pantry_id = pantry_id_json;
        if (!pantry_ids.insert(pantry_id).second) {
            throw std::runtime_error("Duplicate pantry id: " + pantry_id);
        }
        if (buy_ids.contains(pantry_id)) {
            throw std::runtime_error("An ingredient cannot be both purchased and pantry: " + pantry_id);
        }
        if (pantry != nullptr && !pantry->contains(pantry_id)) {
            throw std::runtime_error("Unknown pantry id: " + pantry_id);
        }
    }
    if (!recipe["instructions"].is_array() || recipe["instructions"].empty()) {
        throw std::runtime_error("Instructions must be a non-empty array");
    }
    for (const auto& step : recipe["instructions"]) {
        if (!step.is_string() || step.get<std::string>().empty()) {
            throw std::runtime_error("Every instruction must be a non-empty string");
        }
    }
    validate_substitutions(recipe, ingredients, buy_ids, pantry_ids);
}

} // namespace

std::string validate_recipe_json(
    const std::string& recipe_json,
    const std::string& ingredients_json,
    const std::string& pantry_json
) {
    const json recipe = json::parse(recipe_json);
    const json ingredient_root = json::parse(ingredients_json);
    const json pantry_root = json::parse(pantry_json);
    const auto& ingredients = ingredient_catalogue(ingredient_root);
    const auto& pantry = pantry_catalogue(pantry_root);
    validate_recipe(recipe, ingredients, &pantry);
    return json{{"valid", true}, {"id", recipe["id"]}, {"name", recipe["name"]}}.dump();
}

std::string generate_plan_json(
    const std::string& meals_json,
    const std::string& ingredients_json,
    int count,
    std::uint32_t seed
) {
    const json meals_root = json::parse(meals_json);
    const json ingredient_root = json::parse(ingredients_json);
    const auto& ingredients = ingredient_catalogue(ingredient_root);
    if (!meals_root.contains("meals") || !meals_root["meals"].is_array()) {
        throw std::runtime_error("meals.json must contain a meals array");
    }

    std::vector<json> active;
    for (const auto& meal : meals_root["meals"]) {
        validate_recipe(meal, ingredients, nullptr);
        if (meal.value("active", true)) {
            active.push_back(meal);
        }
    }
    if (count <= 0) {
        throw std::runtime_error("Meal count must be greater than zero");
    }
    if (static_cast<std::size_t>(count) > active.size()) {
        throw std::runtime_error("Not enough active recipes for requested meal count");
    }

    std::vector<std::size_t> indexes(active.size());
    std::iota(indexes.begin(), indexes.end(), 0);
    std::mt19937 rng(seed);
    std::shuffle(indexes.begin(), indexes.end(), rng);
    indexes.resize(static_cast<std::size_t>(count));

    std::map<std::string, Quantity> totals;
    json selected = json::array();
    json macros = {{"calories_kcal", 0.0}, {"protein_g", 0.0}, {"carbs_g", 0.0}, {"fat_g", 0.0}};
    for (const auto index : indexes) {
        const auto& meal = active[index];
        selected.push_back({
            {"id", meal["id"]},
            {"name", meal["name"]},
            {"description", meal["description"]},
            {"macros", meal["macros"]}
        });
        for (const auto* key : {"calories_kcal", "protein_g", "carbs_g", "fat_g"}) {
            macros[key] = macros[key].get<double>() + meal["macros"][key].get<double>();
        }
        for (const auto& item : meal["buy"]) {
            const std::string id = item["ingredient_id"];
            const std::string unit = item["unit"];
            const double quantity = item["quantity"];
            auto& total = totals[id];
            if (!total.unit.empty() && total.unit != unit) {
                throw std::runtime_error("Unit mismatch while aggregating " + id);
            }
            total.unit = unit;
            total.value += quantity;
        }
    }

    json shopping = json::array();
    for (const auto& [id, total] : totals) {
        const auto& metadata = ingredients.at(id);
        const double pack_quantity = metadata["pack_quantity"];
        const std::string pack_unit = metadata["pack_unit"];
        if (pack_unit != total.unit) {
            throw std::runtime_error("Pack unit mismatch for " + id);
        }
        const int packs = std::max(1, static_cast<int>(std::ceil(total.value / pack_quantity)));
        shopping.push_back({
            {"ingredient_id", id},
            {"name", metadata["name"]},
            {"category", metadata["category"]},
            {"needed", total.value},
            {"unit", total.unit},
            {"pack_quantity", pack_quantity},
            {"pack_unit", pack_unit},
            {"packs", packs},
            {"buy_text", std::to_string(packs) + " x " + metadata["name"].get<std::string>()}
        });
    }
    std::sort(shopping.begin(), shopping.end(), [](const json& left, const json& right) {
        if (left["category"] == right["category"]) {
            return left["name"].get<std::string>() < right["name"].get<std::string>();
        }
        return left["category"].get<std::string>() < right["category"].get<std::string>();
    });

    return json{
        {"selected_meals", selected},
        {"shopping_list", shopping},
        {"macro_totals", macros}
    }.dump();
}

} // namespace mealplanner
