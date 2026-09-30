// BUILT 2026-09-30 · jobcreation middleware-2b · Cars for Homeless domains. 2b: cars4homes.com removed (not ours; registered elsewhere).
// Main site: carsforhomeless.com serves the program from this same Pages project:
//   /  -> cars.html      /apply -> cars-apply.html      everything else (styles, /api, images) as usual
// www.carsforhomeless.com, cars4home.com and cars4homeless.com (with or without www)
// redirect to https://carsforhomeless.com. Works once each domain is a Custom domain on this Pages project.
const MAIN = /^carsforhomeless\.com$/i;
const OTHERS = /^(www\.carsforhomeless|(www\.)?(cars4home|cars4homeless))\.com$/i;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const host = url.hostname;

  if (OTHERS.test(host)) {
    const path = /^\/(apply|cars-apply)(\.html)?$/.test(url.pathname) ? "/apply" : "/";
    return Response.redirect("https://carsforhomeless.com" + path, 301);
  }

  if (MAIN.test(host)) {
    if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/index") {
      return context.env.ASSETS.fetch(new URL("/cars", url.origin));
    }
    if (url.pathname === "/apply" || url.pathname === "/apply.html") {
      return context.env.ASSETS.fetch(new URL("/cars-apply", url.origin));
    }
  }
  return context.next();
}
