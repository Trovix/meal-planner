# Deployment

The production site is static. C++ is compiled to WebAssembly during CI; the planner then runs in the browser.

## Production flow

1. Push changes to `main`.
2. `.github/workflows/build-site.yml` validates recipes, runs native tests, compiles the WASM target and writes a complete static site to `dist/`.
3. The workflow publishes `dist/` to the `site` branch.
4. Cloudflare Pages should be connected to this repository with `site` as the production branch and no build command.
5. Attach `meal.james-platt.com` as the Pages custom domain.

The `wasm-webapp` feature branch builds and tests but deliberately does not publish the production `site` branch.

## Cloudflare Pages settings

- Repository: `Trovix/meal-planner`
- Production branch: `site`
- Framework preset: None
- Build command: leave blank
- Build output directory: `/`

If Cloudflare insists on a build command, use `echo "prebuilt"`.

## DNS

If `james-platt.com` is already using Cloudflare nameservers, add the Pages custom domain in Cloudflare and let Cloudflare create the DNS record.

If Namecheap is still authoritative DNS, either move the domain's nameservers to Cloudflare, or keep Namecheap DNS and create the CNAME target Cloudflare shows for the Pages project. Use the exact hostname Cloudflare provides; do not guess it.
