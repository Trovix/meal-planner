#include "mealplanner/planner.hpp"
#include <cassert>
#include <iostream>
#include <nlohmann/json.hpp>
#include <set>
#include <utility>
#include <vector>

using json = nlohmann::json;

int main() {
    const std::string ingredients = R"({"ingredients":{"rice":{"name":"Rice","category":"Cupboard","pack_quantity":500,"pack_unit":"g"},"eggs":{"name":"Eggs","category":"Dairy","pack_quantity":6,"pack_unit":"each"},"breaded":{"name":"Breaded chicken","category":"Meat","pack_quantity":2,"pack_unit":"each"}}})";
    const std::string pantry = R"({"pantry":{"salt":{"name":"Salt"}}})";
    const std::string meals = R"({"meals":[{"id":"a","name":"A","description":"A","servings":1,"active":true,"meal_types":["dinner"],"macros":{"calories_kcal":500,"protein_g":20,"carbs_g":70,"fat_g":10},"buy":[{"ingredient_id":"rice","quantity":300,"unit":"g"}],"pantry":["salt"],"substitutions":[{"id":"breaded","label":"Use breaded chicken","note":"Cook it.","replaces":["rice"],"buy":[{"ingredient_id":"breaded","quantity":1,"unit":"each"}],"omit_pantry":["salt"]}],"instructions":["Cook."]},{"id":"b","name":"B","description":"B","servings":1,"active":true,"meal_types":["breakfast","lunch"],"macros":{"calories_kcal":600,"protein_g":30,"carbs_g":80,"fat_g":15},"buy":[{"ingredient_id":"rice","quantity":300,"unit":"g"},{"ingredient_id":"eggs","quantity":2,"unit":"each"}],"pantry":[],"instructions":["Cook."]}]})";

    const auto plan = json::parse(mealplanner::generate_plan_json(meals, ingredients, 2, 42));
    assert(plan["selected_meals"].size() == 2);
    assert(plan["macro_totals"]["calories_kcal"] == 1100);
    bool rice_found = false;
    for (const auto& item : plan["shopping_list"]) {
        if (item["ingredient_id"] == "rice") {
            rice_found = true;
            assert(item["needed"] == 600);
            assert(item["packs"] == 2);
        }
        assert(item["ingredient_id"] != "salt");
    }
    assert(rice_found);

    const auto dinner_plan = json::parse(
        mealplanner::generate_plan_json(meals, ingredients, 1, 42, "dinner")
    );
    assert(dinner_plan["selected_meals"].size() == 1);
    assert(dinner_plan["selected_meals"][0]["id"] == "a");
    assert(dinner_plan["selected_meals"][0]["meal_types"] == json::array({"dinner"}));

    auto three_dinner_root = json::parse(meals);
    for (const auto& [id, name] : std::vector<std::pair<std::string, std::string>>{
             {"c", "C"}, {"d", "D"}, {"e", "E"}}) {
        auto extra_dinner = three_dinner_root["meals"][0];
        extra_dinner["id"] = id;
        extra_dinner["name"] = name;
        three_dinner_root["meals"].push_back(extra_dinner);
    }
    for (std::uint32_t seed = 0; seed < 100; ++seed) {
        const auto three_dinner_plan = json::parse(
            mealplanner::generate_plan_json(three_dinner_root.dump(), ingredients, 3, seed, "dinner")
        );
        assert(three_dinner_plan["selected_meals"].size() == 3);
        std::set<std::string> selected_ids;
        for (const auto& selected : three_dinner_plan["selected_meals"]) {
            assert(selected["meal_types"] == json::array({"dinner"}));
            selected_ids.insert(selected["id"].get<std::string>());
        }
        assert(selected_ids.size() == 3);
    }

    bool invalid_meal_type_rejected = false;
    try {
        mealplanner::generate_plan_json(meals, ingredients, 3, 42, "supper");
    } catch (const std::exception& error) {
        invalid_meal_type_rejected = std::string(error.what()) ==
            "Meal type must be breakfast, lunch or dinner";
    }
    assert(invalid_meal_type_rejected);

    const auto first_recipe = json::parse(meals)["meals"][0];
    const auto validation = json::parse(
        mealplanner::validate_recipe_json(first_recipe.dump(), ingredients, pantry)
    );
    assert(validation["valid"] == true);

    auto make_ahead_recipe = first_recipe;
    make_ahead_recipe["make_ahead"] = {
        {"component", "Sauce"},
        {"max_refrigerated_hours", 48},
        {"instructions", {"Cook and blend."}},
        {"storage", "Cool promptly, cover and refrigerate."},
        {"day_of", {"Reheat until steaming."}}
    };
    const auto make_ahead_validation = json::parse(
        mealplanner::validate_recipe_json(make_ahead_recipe.dump(), ingredients, pantry)
    );
    assert(make_ahead_validation["valid"] == true);

    auto invalid_meal_types_recipe = first_recipe;
    invalid_meal_types_recipe["meal_types"] = {"dinner", "dinner"};
    bool invalid_meal_types_rejected = false;
    try {
        mealplanner::validate_recipe_json(invalid_meal_types_recipe.dump(), ingredients, pantry);
    } catch (const std::exception&) {
        invalid_meal_types_rejected = true;
    }
    assert(invalid_meal_types_rejected);

    make_ahead_recipe["make_ahead"].erase("storage");
    bool invalid_make_ahead_rejected = false;
    try {
        mealplanner::validate_recipe_json(make_ahead_recipe.dump(), ingredients, pantry);
    } catch (const std::exception&) {
        invalid_make_ahead_rejected = true;
    }
    assert(invalid_make_ahead_rejected);
    std::cout << "planner tests passed\n";
}
