#include "mealplanner/planner.hpp"
#include <cstdlib>
#include <cstring>
#include <exception>
#include <string>
#include <emscripten/emscripten.h>
#include <nlohmann/json.hpp>
static char* copy_result(const std::string& v){auto*m=(char*)std::malloc(v.size()+1);if(!m)return nullptr;std::memcpy(m,v.c_str(),v.size()+1);return m;}
static std::string error_json(const std::exception&e){return nlohmann::json{{"error",e.what()}}.dump();}
extern "C" {
EMSCRIPTEN_KEEPALIVE char* generate_plan(const char* meals,const char* ingredients,int count,unsigned seed){try{return copy_result(mealplanner::generate_plan_json(meals?meals:"",ingredients?ingredients:"",count,seed));}catch(const std::exception&e){return copy_result(error_json(e));}}
EMSCRIPTEN_KEEPALIVE char* generate_plan_for_type(const char* meals,const char* ingredients,int count,unsigned seed,const char* meal_type){try{return copy_result(mealplanner::generate_plan_json(meals?meals:"",ingredients?ingredients:"",count,seed,meal_type?meal_type:""));}catch(const std::exception&e){return copy_result(error_json(e));}}
EMSCRIPTEN_KEEPALIVE char* validate_recipe(const char* recipe,const char* ingredients,const char* pantry){try{return copy_result(mealplanner::validate_recipe_json(recipe?recipe:"",ingredients?ingredients:"",pantry?pantry:""));}catch(const std::exception&e){return copy_result(error_json(e));}}
EMSCRIPTEN_KEEPALIVE void free_result(char* p){std::free(p);}
}
