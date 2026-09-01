#pragma once
#include <cstdint>
#include <string>

namespace mealplanner {
std::string generate_plan_json(const std::string& meals_json, const std::string& ingredients_json, int count, std::uint32_t seed);
std::string validate_recipe_json(const std::string& recipe_json, const std::string& ingredients_json);
}
