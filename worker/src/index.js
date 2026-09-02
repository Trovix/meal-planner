const OWNER = "Trovix";
const REPO = "meal-planner";
const BRANCH = "main";
const ALLOWED_ORIGINS = new Set([
  "https://meal.james-platt.com",
  "https://trovix.github.io",
]);
const MAX_BODY_BYTES = 100_000;
const MAX_GITHUB_RESPONSE_BYTES = 500_000;
const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner"]);

function cors(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function json(body, status = 200, origin = "") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(origin ? cors(origin) : {}),
    },
  });
}

function finite(value, min = 0, max = 1_000_000) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function shortString(value, max) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function safeId(value) {
  return typeof value === "string" && /^[a-z0-9_]{1,64}$/.test(value);
}

async function readLimitedStream(stream, maxBytes) {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("Payload is too large.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

async function readRequestJson(request) {
  const bytes = await readLimitedStream(request.body, MAX_BODY_BYTES);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function readResponseJson(response) {
  const bytes = await readLimitedStream(response.body, MAX_GITHUB_RESPONSE_BYTES);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function validateIngredientDefinition(id, definition) {
  if (
    !safeId(id) ||
    !definition ||
    typeof definition !== "object" ||
    Array.isArray(definition) ||
    !shortString(definition.name, 120) ||
    !shortString(definition.category, 80) ||
    !finite(definition.pack_quantity, 0.000001, 1_000_000) ||
    !shortString(definition.pack_unit, 24)
  ) {
    throw new Error(`Invalid ingredient definition: ${id}.`);
  }
}

function validatePantryDefinition(id, definition) {
  if (
    !safeId(id) ||
    !definition ||
    typeof definition !== "object" ||
    Array.isArray(definition) ||
    !shortString(definition.name, 120)
  ) {
    throw new Error(`Invalid pantry definition: ${id}.`);
  }
}

function validateBuyItems(items, label, requireItems = true) {
  if (!Array.isArray(items) || (requireItems && items.length < 1) || items.length > 80) {
    throw new Error(`${label} must contain between ${requireItems ? 1 : 0} and 80 items.`);
  }
  const seen = new Set();
  for (const item of items) {
    if (
      !safeId(item?.ingredient_id) ||
      !finite(item?.quantity, 0.000001, 1_000_000) ||
      !shortString(item?.unit, 24)
    ) {
      throw new Error(`Invalid ${label} ingredient.`);
    }
    if (seen.has(item.ingredient_id)) {
      throw new Error(`Duplicate ingredient '${item.ingredient_id}' in ${label}.`);
    }
    seen.add(item.ingredient_id);
  }
  return seen;
}

function validateRecipeShape(recipe) {
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) {
    throw new Error("Recipe must be an object.");
  }
  if (!safeId(recipe.id)) {
    throw new Error("Recipe ID must contain only lowercase letters, numbers and underscores.");
  }
  if (!shortString(recipe.name, 160) || !shortString(recipe.description, 1000)) {
    throw new Error("Invalid recipe name or description.");
  }
  if (!Number.isInteger(recipe.servings) || recipe.servings < 1 || recipe.servings > 20) {
    throw new Error("Servings must be between 1 and 20.");
  }
  if (typeof recipe.active !== "boolean") throw new Error("Active must be true or false.");
  if (
    !Array.isArray(recipe.meal_types) ||
    recipe.meal_types.length < 1 ||
    recipe.meal_types.length > MEAL_TYPES.size ||
    new Set(recipe.meal_types).size !== recipe.meal_types.length ||
    recipe.meal_types.some((mealType) => !MEAL_TYPES.has(mealType))
  ) {
    throw new Error("Meal types must contain unique breakfast, lunch or dinner values.");
  }
  if (
    !recipe.macros ||
    !finite(recipe.macros.calories_kcal, 0, 10_000) ||
    !finite(recipe.macros.protein_g, 0, 1000) ||
    !finite(recipe.macros.carbs_g, 0, 2000) ||
    !finite(recipe.macros.fat_g, 0, 1000)
  ) {
    throw new Error("Invalid macros.");
  }
  validateBuyItems(recipe.buy, "shopping list");
  if (
    !Array.isArray(recipe.pantry) ||
    recipe.pantry.length > 80 ||
    recipe.pantry.some((id) => !safeId(id)) ||
    new Set(recipe.pantry).size !== recipe.pantry.length
  ) {
    throw new Error("Invalid pantry list.");
  }
  if (
    !Array.isArray(recipe.instructions) ||
    recipe.instructions.length < 1 ||
    recipe.instructions.length > 100 ||
    recipe.instructions.some((step) => !shortString(step, 1000))
  ) {
    throw new Error("Invalid instructions.");
  }
  if (recipe.make_ahead !== undefined) {
    const makeAhead = recipe.make_ahead;
    const expected = new Set([
      "component",
      "max_refrigerated_hours",
      "instructions",
      "storage",
      "day_of",
    ]);
    if (
      !makeAhead ||
      typeof makeAhead !== "object" ||
      Array.isArray(makeAhead) ||
      Object.keys(makeAhead).length !== expected.size ||
      Object.keys(makeAhead).some((key) => !expected.has(key)) ||
      !shortString(makeAhead.component, 160) ||
      !Number.isInteger(makeAhead.max_refrigerated_hours) ||
      makeAhead.max_refrigerated_hours < 1 ||
      makeAhead.max_refrigerated_hours > 48 ||
      !Array.isArray(makeAhead.instructions) ||
      makeAhead.instructions.length < 1 ||
      makeAhead.instructions.length > 30 ||
      makeAhead.instructions.some((step) => !shortString(step, 1000)) ||
      !shortString(makeAhead.storage, 1000) ||
      !Array.isArray(makeAhead.day_of) ||
      makeAhead.day_of.length < 1 ||
      makeAhead.day_of.length > 30 ||
      makeAhead.day_of.some((step) => !shortString(step, 1000))
    ) {
      throw new Error("Invalid make-ahead guidance.");
    }
  }

  const ingredientDefinitions = recipe.ingredient_definitions || {};
  if (
    typeof ingredientDefinitions !== "object" ||
    Array.isArray(ingredientDefinitions) ||
    Object.keys(ingredientDefinitions).length > 40
  ) {
    throw new Error("Invalid ingredient definitions.");
  }
  for (const [id, definition] of Object.entries(ingredientDefinitions)) {
    validateIngredientDefinition(id, definition);
  }

  const pantryDefinitions = recipe.pantry_definitions || {};
  if (
    typeof pantryDefinitions !== "object" ||
    Array.isArray(pantryDefinitions) ||
    Object.keys(pantryDefinitions).length > 40
  ) {
    throw new Error("Invalid pantry definitions.");
  }
  for (const [id, definition] of Object.entries(pantryDefinitions)) {
    validatePantryDefinition(id, definition);
  }

  if (recipe.substitutions !== undefined) {
    if (!Array.isArray(recipe.substitutions) || recipe.substitutions.length > 20) {
      throw new Error("Invalid substitutions.");
    }
    const seen = new Set();
    for (const substitution of recipe.substitutions) {
      if (
        !safeId(substitution?.id) ||
        seen.has(substitution.id) ||
        !shortString(substitution.label, 160) ||
        !shortString(substitution.note, 1000) ||
        !Array.isArray(substitution.replaces) ||
        !substitution.replaces.length ||
        substitution.replaces.some((id) => !safeId(id)) ||
        new Set(substitution.replaces).size !== substitution.replaces.length ||
        !Array.isArray(substitution.omit_pantry || []) ||
        (substitution.omit_pantry || []).some((id) => !safeId(id)) ||
        new Set(substitution.omit_pantry || []).size !== (substitution.omit_pantry || []).length
      ) {
        throw new Error("Invalid substitution.");
      }
      seen.add(substitution.id);
      validateBuyItems(substitution.buy, `substitution '${substitution.id}' shopping list`);
    }
  }

  const allowed = new Set([
    "id",
    "name",
    "description",
    "servings",
    "active",
    "meal_types",
    "macros",
    "buy",
    "pantry",
    "instructions",
    "make_ahead",
    "substitutions",
    "ingredient_definitions",
    "pantry_definitions",
  ]);
  for (const key of Object.keys(recipe)) {
    if (!allowed.has(key)) throw new Error(`Unexpected recipe field: ${key}.`);
  }
  return recipe;
}

function validateRecipeReferences(recipe, ingredientRoot, pantryRoot) {
  const ingredients = ingredientRoot.ingredients;
  const pantry = pantryRoot.pantry;
  if (!ingredients || typeof ingredients !== "object" || !pantry || typeof pantry !== "object") {
    throw new Error("Repository catalogues are invalid.");
  }
  const buyIds = new Set();
  for (const item of recipe.buy) {
    const definition = ingredients[item.ingredient_id];
    if (!definition) throw new Error(`Unknown shopping ingredient '${item.ingredient_id}'.`);
    if (definition.pack_unit !== item.unit) {
      throw new Error(`Unit mismatch for '${item.ingredient_id}'.`);
    }
    buyIds.add(item.ingredient_id);
  }
  for (const pantryId of recipe.pantry) {
    if (!pantry[pantryId]) throw new Error(`Unknown pantry ingredient '${pantryId}'.`);
    if (buyIds.has(pantryId)) {
      throw new Error(`'${pantryId}' cannot be both a shopping and pantry ingredient.`);
    }
  }
  for (const substitution of recipe.substitutions || []) {
    if (substitution.replaces.some((id) => !buyIds.has(id))) {
      throw new Error(`Substitution '${substitution.id}' replaces an item not in the recipe.`);
    }
    for (const item of substitution.buy) {
      const definition = ingredients[item.ingredient_id];
      if (!definition || definition.pack_unit !== item.unit) {
        throw new Error(`Invalid shopping item in substitution '${substitution.id}'.`);
      }
    }
    if ((substitution.omit_pantry || []).some((id) => !recipe.pantry.includes(id))) {
      throw new Error(`Substitution '${substitution.id}' omits an item not in the recipe pantry list.`);
    }
  }
}

async function secureEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function base64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64Utf8(value) {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function githubHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "meal-planner-publisher",
    "content-type": "application/json",
  };
}

function githubUrl(path) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodedPath}`;
}

async function readRepositoryFile(path, token, optional = false) {
  const response = await fetch(`${githubUrl(path)}?ref=${BRANCH}`, {
    headers: githubHeaders(token),
  });
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub lookup failed for ${path} (${response.status}).`);
  const body = await readResponseJson(response);
  return { sha: body.sha, content: decodeBase64Utf8(body.content) };
}

async function writeRepositoryFile(path, content, message, token, sha = null) {
  const body = { message, content: base64Utf8(content), branch: BRANCH };
  if (sha) body.sha = sha;
  const response = await fetch(githubUrl(path), {
    method: "PUT",
    headers: githubHeaders(token),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.error(JSON.stringify({ event: "github_write_failed", path, status: response.status }));
    throw new Error(`GitHub write failed for ${path} (${response.status}).`);
  }
  return readResponseJson(response);
}

function mergeDefinitions(target, definitions, validator, label) {
  let changed = false;
  for (const [id, definition] of Object.entries(definitions || {})) {
    validator(id, definition);
    if (target[id]) {
      if (JSON.stringify(target[id]) !== JSON.stringify(definition)) {
        throw new Error(`${label} '${id}' already exists with different metadata.`);
      }
      continue;
    }
    target[id] = definition;
    changed = true;
  }
  return changed;
}

async function publishToGitHub(recipe, token) {
  const recipePath = `data/recipes/${recipe.id}.json`;
  const [ingredientFile, pantryFile, existingRecipe] = await Promise.all([
    readRepositoryFile("data/ingredients.json", token),
    readRepositoryFile("data/pantry.json", token),
    readRepositoryFile(recipePath, token, true),
  ]);
  const ingredientRoot = JSON.parse(ingredientFile.content);
  const pantryRoot = JSON.parse(pantryFile.content);
  if (
    !ingredientRoot.ingredients ||
    typeof ingredientRoot.ingredients !== "object" ||
    !pantryRoot.pantry ||
    typeof pantryRoot.pantry !== "object"
  ) {
    throw new Error("Repository catalogues are invalid.");
  }
  const ingredientsChanged = mergeDefinitions(
    ingredientRoot.ingredients,
    recipe.ingredient_definitions,
    validateIngredientDefinition,
    "Shopping ingredient",
  );
  const pantryChanged = mergeDefinitions(
    pantryRoot.pantry,
    recipe.pantry_definitions,
    validatePantryDefinition,
    "Pantry ingredient",
  );
  validateRecipeReferences(recipe, ingredientRoot, pantryRoot);

  const savedRecipe = JSON.parse(JSON.stringify(recipe));
  delete savedRecipe.ingredient_definitions;
  delete savedRecipe.pantry_definitions;

  if (ingredientsChanged) {
    await writeRepositoryFile(
      "data/ingredients.json",
      `${JSON.stringify(ingredientRoot, null, 2)}\n`,
      `Add shopping ingredients for: ${recipe.name}`,
      token,
      ingredientFile.sha,
    );
  }
  if (pantryChanged) {
    await writeRepositoryFile(
      "data/pantry.json",
      `${JSON.stringify(pantryRoot, null, 2)}\n`,
      `Add pantry ingredients for: ${recipe.name}`,
      token,
      pantryFile.sha,
    );
  }
  const result = await writeRepositoryFile(
    recipePath,
    `${JSON.stringify(savedRecipe, null, 2)}\n`,
    `${existingRecipe ? "Update" : "Add"} recipe: ${recipe.name}`,
    token,
    existingRecipe?.sha || null,
  );
  return {
    updated: Boolean(existingRecipe),
    path: recipePath,
    catalogues_updated: ingredientsChanged || pantryChanged,
    commit: result.commit?.sha || null,
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") || "";
    if (request.method === "OPTIONS") {
      return ALLOWED_ORIGINS.has(origin)
        ? new Response(null, { status: 204, headers: cors(origin) })
        : new Response(null, { status: 403 });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return json({ ok: true });
    if (url.pathname !== "/publish" || request.method !== "POST") {
      return json({ error: "Not found." }, 404, ALLOWED_ORIGINS.has(origin) ? origin : "");
    }
    if (!ALLOWED_ORIGINS.has(origin)) return json({ error: "Origin not allowed." }, 403);
    if (!env.ADMIN_PASSWORD || !env.GITHUB_TOKEN) {
      return json({ error: "Publisher is not configured." }, 503, origin);
    }
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > MAX_BODY_BYTES) {
      return json({ error: "Request too large." }, 413, origin);
    }

    let body;
    try {
      body = await readRequestJson(request);
    } catch (error) {
      const tooLarge = error.message === "Payload is too large.";
      return json({ error: tooLarge ? "Request too large." : "Invalid JSON." }, tooLarge ? 413 : 400, origin);
    }
    if (!(await secureEqual(body?.password, env.ADMIN_PASSWORD))) {
      return json({ error: "Incorrect admin password." }, 401, origin);
    }

    let recipe;
    try {
      recipe = validateRecipeShape(body?.recipe);
    } catch (error) {
      return json({ error: error.message }, 400, origin);
    }
    try {
      const result = await publishToGitHub(recipe, env.GITHUB_TOKEN);
      console.log(JSON.stringify({ event: "recipe_published", recipe_id: recipe.id, ...result }));
      return json({ ok: true, ...result }, 200, origin);
    } catch (error) {
      console.error(JSON.stringify({ event: "publish_failed", recipe_id: recipe.id, message: error.message }));
      return json({ error: "Could not publish recipe." }, 502, origin);
    }
  },
};
