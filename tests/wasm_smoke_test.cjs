const fs = require("node:fs");
const path = require("node:path");

const [gluePath, wasmPath, mealsPath, ingredientsPath] = process.argv.slice(2);
if (!ingredientsPath) {
  throw new Error(
    "usage: node wasm_smoke_test.cjs <mealplanner.js> <mealplanner.wasm> <meals.json> <ingredients.json>",
  );
}

const glue = fs.readFileSync(gluePath, "utf8");
const loadFactory = new Function(
  "require",
  "__filename",
  "__dirname",
  `${glue}\nreturn createMealPlannerModule;`,
);
const absoluteGluePath = path.resolve(gluePath);
const moduleFactory = loadFactory(require, absoluteGluePath, path.dirname(absoluteGluePath));
const mealsJson = fs.readFileSync(mealsPath, "utf8");
const ingredientsJson = fs.readFileSync(ingredientsPath, "utf8");
const mealsRoot = JSON.parse(mealsJson);

function activeCount(mealType) {
  return mealsRoot.meals.filter(
    (meal) => meal.active !== false && meal.meal_types.includes(mealType),
  ).length;
}

async function main() {
  const module = await moduleFactory({
    locateFile: () => path.resolve(wasmPath),
  });
  const generate = module.cwrap("generate_plan_for_type", "number", [
    "string",
    "string",
    "number",
    "number",
    "string",
  ]);
  const free = module.cwrap("free_result", null, ["number"]);

  function roll(mealType, seed) {
    const pointer = generate(mealsJson, ingredientsJson, 3, seed, mealType);
    if (!pointer) throw new Error("WebAssembly planner returned a null result pointer");
    try {
      return JSON.parse(module.UTF8ToString(pointer));
    } finally {
      free(pointer);
    }
  }

  for (const mealType of ["dinner", "breakfast"]) {
    if (activeCount(mealType) < 3) continue;
    for (let seed = 0; seed < 100; seed += 1) {
      const plan = roll(mealType, seed);
      if (plan.error) throw new Error(`${mealType} seed ${seed}: ${plan.error}`);
      if (plan.selected_meals?.length !== 3) {
        throw new Error(`${mealType} seed ${seed}: expected exactly three recipes`);
      }
      const ids = new Set(plan.selected_meals.map((meal) => meal.id));
      if (ids.size !== 3) throw new Error(`${mealType} seed ${seed}: duplicate recipe`);
      if (plan.selected_meals.some((meal) => !meal.meal_types.includes(mealType))) {
        throw new Error(`${mealType} seed ${seed}: wrong meal type returned`);
      }
    }
  }

  for (const mealType of ["lunch", "snack"]) {
    if (activeCount(mealType) !== 0) continue;
    const plan = roll(mealType, 0);
    if (!plan.error?.includes(`active ${mealType} recipes`)) {
      throw new Error(`${mealType}: empty category did not return a useful error`);
    }
  }

  const finalPlan = roll("dinner", 101);
  if (finalPlan.error || finalPlan.selected_meals?.length !== 3) {
    throw new Error("Planner was not usable after handling an empty category");
  }

  console.log("WebAssembly planner smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
