(() => {
  const generateButton = document.querySelector("#generate");
  const status = document.querySelector("#status");
  const result = document.querySelector("#result");
  const mealsElement = document.querySelector("#meals");
  const macroElement = document.querySelector("#macro-summary");

  let module;
  let generatePlan;
  let freeResult;
  let mealsJson = "";
  let ingredientsJson = "";
  let mealsRoot = null;
  let ingredientsRoot = null;

  function randomSeed() {
    return globalThis.crypto?.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(1))[0]
      : Date.now() >>> 0;
  }

  async function initialise() {
    try {
      const [mealsResponse, ingredientsResponse, wasm] = await Promise.all([
        fetch("data/meals.json", { cache: "no-store" }),
        fetch("data/ingredients.json", { cache: "no-store" }),
        createMealPlannerModule(),
      ]);

      if (!mealsResponse.ok || !ingredientsResponse.ok) {
        throw new Error("Could not load recipe data.");
      }

      [mealsJson, ingredientsJson] = await Promise.all([
        mealsResponse.text(),
        ingredientsResponse.text(),
      ]);
      mealsRoot = JSON.parse(mealsJson);
      ingredientsRoot = JSON.parse(ingredientsJson);
      module = wasm;
      generatePlan = module.cwrap("generate_plan", "number", [
        "string",
        "string",
        "number",
        "number",
      ]);
      freeResult = module.cwrap("free_result", null, ["number"]);
      generateButton.disabled = false;
      status.textContent = "";
    } catch (error) {
      status.textContent = error.message || "Planner failed to load.";
      status.classList.add("error");
    }
  }

  function renderPlan(plan) {
    mealsElement.replaceChildren();

    for (const selected of plan.selected_meals) {
      const meal = mealsRoot.meals.find((candidate) => candidate.id === selected.id);
      if (!meal) continue;
      mealsElement.append(
        MealRecipeView.createRecipeCard(meal, ingredientsRoot, { headingLevel: 3 }),
      );
    }

    const macros = plan.macro_totals;
    macroElement.replaceChildren(
      Object.assign(document.createElement("p"), {
        textContent:
          `${Math.round(macros.calories_kcal)} kcal · ` +
          `${Math.round(macros.protein_g)} g protein · ` +
          `${Math.round(macros.carbs_g)} g carbs · ` +
          `${Math.round(macros.fat_g)} g fat`,
      }),
      Object.assign(document.createElement("p"), {
        textContent: "Totals for the three rolled dinners.",
      }),
    );
    result.classList.remove("hidden");
  }

  generateButton.addEventListener("click", () => {
    status.className = "status";
    status.textContent = "Rolling…";
    let pointer = 0;

    try {
      pointer = generatePlan(mealsJson, ingredientsJson, 3, randomSeed());
      if (!pointer) throw new Error("C++ planner returned no result.");

      const plan = JSON.parse(module.UTF8ToString(pointer));
      if (plan.error) throw new Error(plan.error);

      renderPlan(plan);
      status.textContent = "Three meals rolled.";
    } catch (error) {
      status.textContent = error.message || "Could not generate a meal plan.";
      status.classList.add("error");
    } finally {
      if (pointer) freeResult(pointer);
    }
  });

  initialise();
})();
