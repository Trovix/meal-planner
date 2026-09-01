(() => {
  const status = document.querySelector("#status");
  const registry = document.querySelector("#registry");

  async function initialise() {
    try {
      const [mealsResponse, ingredientsResponse, pantryResponse] = await Promise.all([
        fetch("data/meals.json", { cache: "no-store" }),
        fetch("data/ingredients.json", { cache: "no-store" }),
        fetch("data/pantry.json", { cache: "no-store" }),
      ]);

      if (!mealsResponse.ok || !ingredientsResponse.ok || !pantryResponse.ok) {
        throw new Error("Could not load recipe registry.");
      }

      const [mealsRoot, ingredientsRoot, pantryRoot] = await Promise.all([
        mealsResponse.json(),
        ingredientsResponse.json(),
        pantryResponse.json(),
      ]);
      const meals = [...(mealsRoot.meals || [])].sort((left, right) =>
        left.name.localeCompare(right.name),
      );

      registry.replaceChildren();
      for (const meal of meals) {
        registry.append(MealRecipeView.createRecipeCard(meal, ingredientsRoot, pantryRoot));
      }

      status.textContent = `${meals.length} recipe${meals.length === 1 ? "" : "s"}.`;
    } catch (error) {
      status.textContent = error.message || "Could not load registry.";
      status.classList.add("error");
    }
  }

  initialise();
})();
