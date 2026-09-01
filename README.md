# Meal Planner

C++ meal-planning engine driven by GitHub Actions and designed to be called from an iPhone Shortcut.

## Workflow inputs

- `meals`: comma-separated meal IDs, e.g. `steak_au_poivre,salmon_fried_rice`
- `request_id`: unique ID supplied by the Shortcut so it can identify its completed result

The workflow compiles the C++ engine, aggregates duplicate ingredients, rounds requirements to configured pack sizes, totals approximate macros, and commits `output/latest.json`.

## Current meals

- `steak_au_poivre`
- `salmon_fried_rice`
- `chicken_peanut_noodles`
- `pork_mustard_mash`
- `chicken_milanese_rigatoni`

## Local test

```bash
cmake -S . -B build
cmake --build build
./build/mealplanner "steak_au_poivre,chicken_peanut_noodles" "local-test"
```

> Tesco pack sizes in `data/ingredients.json` are initial working values. They can be refined as preferred Tesco products are finalised.
