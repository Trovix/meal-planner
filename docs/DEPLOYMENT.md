# Deployment

The production site is static. C++ is compiled to WebAssembly during CI; the planner then runs in the browser.

## Production flow

1. Push changes to `main`.
2. `.github/workflows/build-site.yml` validates recipes, runs native tests, compiles the WASM target and writes a complete static site to `dist/`.
3. The workflow publishes `dist/` with GitHub Pages.
4. GitHub Pages is configured for a custom GitHub Actions workflow and uses `meal.james-platt.com` as its custom domain.
5. Cloudflare DNS keeps an unproxied `CNAME` from `meal.james-platt.com` to `trovix.github.io`.

Pull requests build and test the site but do not publish it.

## GitHub Pages settings

- Source: GitHub Actions
- Custom domain: `meal.james-platt.com`
- Enforce HTTPS: enabled once GitHub finishes provisioning the certificate

Because this repository uses a custom Actions workflow, a `CNAME` file is not required and would be ignored.

## Publisher Worker

Cloudflare Builds deploys the Worker from `worker/` on each push to `main`.

- Worker: `meal-planner-publisher`
- Custom domain: `meal-api.james-platt.com`
- Required runtime secrets: `ADMIN_PASSWORD` and `GITHUB_TOKEN`

Store both values as encrypted Worker runtime secrets. Build-time secrets alone are not available through the Worker's `env` parameter.
