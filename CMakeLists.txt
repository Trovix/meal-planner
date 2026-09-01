cmake_minimum_required(VERSION 3.20)
project(mealplanner LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(EMSCRIPTEN)
  add_library(nlohmann_json INTERFACE)
  target_include_directories(nlohmann_json INTERFACE ${CMAKE_SOURCE_DIR}/third_party)
  add_library(nlohmann_json::nlohmann_json ALIAS nlohmann_json)
else()
  find_package(nlohmann_json 3.2.0 REQUIRED)
endif()

add_library(mealplanner_core src/planner.cpp)
target_include_directories(mealplanner_core PUBLIC include)
target_link_libraries(mealplanner_core PUBLIC nlohmann_json::nlohmann_json)

if(EMSCRIPTEN)
  add_executable(mealplanner_wasm wasm/bindings.cpp)
  target_link_libraries(mealplanner_wasm PRIVATE mealplanner_core)
  target_compile_options(mealplanner_core PRIVATE "-fexceptions")
  target_compile_options(mealplanner_wasm PRIVATE "-fexceptions")
  set_target_properties(mealplanner_wasm PROPERTIES OUTPUT_NAME "mealplanner" SUFFIX ".js")
  target_link_options(mealplanner_wasm PRIVATE
    "-O3"
    "-fexceptions"
    "-sMODULARIZE=1"
    "-sEXPORT_NAME=createMealPlannerModule"
    "-sALLOW_MEMORY_GROWTH=1"
    "-sSTACK_SIZE=1048576"
    "-sEXPORTED_FUNCTIONS=['_generate_plan','_generate_plan_for_type','_validate_recipe','_free_result']"
    "-sEXPORTED_RUNTIME_METHODS=['cwrap','UTF8ToString']"
  )
else()
  add_executable(mealplanner src/main.cpp)
  target_link_libraries(mealplanner PRIVATE mealplanner_core)
  enable_testing()
  add_executable(mealplanner_tests tests/planner_tests.cpp)
  target_link_libraries(mealplanner_tests PRIVATE mealplanner_core)
  add_test(NAME mealplanner_tests COMMAND mealplanner_tests)
endif()
