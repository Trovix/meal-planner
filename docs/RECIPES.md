# Adding recipes

The source of truth is `data/recipes/*.json`. The deployed `data/meals.json` is generated automatically.

## Browser editor

Open `/add-recipe.html` and complete the recipe form. Shopping ingredients and pantry ingredients are deliberately separate:

- **Shopping ingredients** are included in the recipe's HTML shopping list and iPhone reminder list.
- **Pantry ingredients (assumed in stock)** are excluded from reminders but always shown on expanded recipe cards.

Pantry ingredients are selected from the searchable central catalogue in `data/pantry.json`. The form validates the recipe and shows a real recipe-card preview before publishing.

Every recipe must select one or more `meal_types` values from `breakfast`, `lunch`, `dinner` and `snack`. Recipes can belong to multiple meal types; the planner and registry include a recipe when it matches the selected type.

## New shopping ingredients

If an ingredient is absent from `data/ingredients.json`, define its display name, shopping category, normal pack quantity and unit in the form. Publishing adds it to the central catalogue before saving the recipe.

The pack unit must match the unit used by the recipe so the planner can calculate the number of packs to buy.

## New pantry ingredients

If a shelf-stable ingredient that is normally assumed to be in stock is absent from `data/pantry.json`, add its stable ID and display name in the form. It then becomes available in the searchable pantry selector.

Every selected pantry ID must exist in the catalogue. An ingredient cannot appear in both the shopping and pantry sections of the same recipe.

## Optional substitutions

Substitutions identify the standard shopping ingredient IDs they replace and the alternative shopping items to use. Expanded recipe cards provide a checkbox for each substitution. Selecting it immediately updates the visible shopping list, pantry list and reminder payload.

## Optional prepare-ahead guidance

Use the prepare-ahead fields only when a worthwhile component can be refrigerated without harming the finished meal. Supply the component, a maximum refrigerated time of no more than 48 hours, preparation steps, cooling and storage guidance, and the steps needed on the day. The ordinary method must still explain how to cook the whole recipe in one session.

Recipe cards show a compact prepare-ahead cue and put the full guidance inside the expanded card. A partially completed block is rejected by the browser, C++ and publishing validators.

## Manual workflow

Downloaded recipe JSON can be placed in `data/recipes/`, then validated with:

```bash
python3 tools/build_registry.py \
  --out data/meals.json \
  --ingredients-out /tmp/ingredients.json \
  --pantry-out /tmp/pantry.json
```

CI rejects malformed recipes, missing or invalid meal types, duplicate or unknown IDs, conflicting pantry/shopping selections, non-positive quantities, unit mismatches and invalid substitutions.
