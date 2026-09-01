# Meal Planner

A small C++ meal-planning engine compiled to WebAssembly and served as a static site.

```text
meal.james-platt.com
        ↓
C++ WASM selects three active recipes
        ↓
ingredients are aggregated and rounded to pack sizes
        ↓
Apple Shortcut receives newline-separated shopping items
        ↓
Apple Reminders
```

There is no application server and no runtime API key. GitHub Actions is used only for build/test/deployment.

## Repository layout

```text
data/recipes/         source recipe files
data/ingredients.json purchasing catalogue
include/              C++ public headers
src/                  C++ planner + native CLI
wasm/                 Emscripten C interface
web/                  static UI and recipe editor
tools/                registry validation/build script
tests/                native tests
docs/                 deployment and recipe docs
```

## Native development

Requirements: CMake, a C++20 compiler, Python 3 and nlohmann/json.

```bash
python3 tools/build_registry.py --out build/meals.json
cmake -S . -B build
cmake --build build
ctest --test-dir build --output-on-failure
./build/mealplanner build/meals.json data/ingredients.json 3
```

## WebAssembly development

Install Emscripten, then:

```bash
mkdir -p dist/data
python3 tools/build_registry.py --out dist/data/meals.json
cp data/ingredients.json dist/data/ingredients.json
cp -R web/. dist/
emcmake cmake -S . -B build-wasm
cmake --build build-wasm
cp build-wasm/mealplanner.js build-wasm/mealplanner.wasm dist/
```

Serve `dist/` with a local HTTP server. Do not open `index.html` directly from `file://` because browsers restrict WASM/fetch there.

See `docs/DEPLOYMENT.md` and `docs/RECIPES.md`.
