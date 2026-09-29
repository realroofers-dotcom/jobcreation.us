// BUILT 2026-09-29 · jobcreation middleware-1a · The Cars for Homes domains (cars4homes.com, cars4home.com,
// carsforhomeless.com, cars4homeless.com, with or without www) land on jobcreation.us/cars.html.
// Works once each domain is added as a Custom domain on this Cloudflare Pages project.
const CARS_HOSTS = /^(www\.)?(cars4homes|cars4home|carsforhomeless|cars4homeless)\.com$/i;

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (CARS_HOSTS.test(url.hostname)) {
    return Response.redirect("https://jobcreation.us/cars.html", 301);
  }
  return context.next();
}