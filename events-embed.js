/* BUILT 2026-09-29 · jobcreation events-embed-1a
   Shows the Foundation's events on any site: jobcreation.us, the Hikers Ball site, gigapoo (TrailShrinks).
   Paste where the list should appear:
     <div data-jc-events data-type="gala"></div>
     <script src="https://jobcreation.us/events-embed.js" defer></script>
   data-type is optional (hike, gala, training, trip, art); leave it off to show every upcoming event.
   data-empty sets the "nothing scheduled" text. Styling is minimal and inherits the host page's fonts. */
(function () {
  var API = "https://jobcreation.us/api/events?upcoming=1";
  var LABEL = { hike: "Hike", gala: "Hikers Ball", training: "Training", trip: "Trip", art: "Art show" };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function when(e) {
    if (!e.event_date) return "Date to be announced";
    var fmt = function (d) {
      var t = new Date(d + "T12:00:00");
      return isNaN(t) ? d : t.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
    };
    return e.end_date && e.end_date !== e.event_date ? fmt(e.event_date) + " to " + fmt(e.end_date) : fmt(e.event_date);
  }
  function maps(e) {
    // Only a real meeting point gets a Directions button (not "Location to be announced").
    var dest = e.meeting_lat && e.meeting_lng ? e.meeting_lat + "," + e.meeting_lng : (e.meeting_address || "");
    return dest ? "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(dest) : "";
  }

  if (!document.getElementById("jc-events-css")) {
    var css = document.createElement("style");
    css.id = "jc-events-css";
    css.textContent =
      ".jc-ev{border:1px solid #e2e7ee;border-left:5px solid #FFC107;border-radius:0 10px 10px 0;padding:16px 18px;margin:0 0 14px;background:#fff;color:#14181f}" +
      ".jc-ev .k{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#0056B3}" +
      ".jc-ev h3{margin:4px 0 4px;font-size:20px;color:#0A1E3D}.jc-ev .w{font-size:14px;color:#5c6672}" +
      ".jc-ev p{margin:10px 0 0;font-size:15px;color:#3a4350}.jc-ev .a{margin-top:12px;display:flex;gap:10px;flex-wrap:wrap}" +
      ".jc-ev .a a{font-size:14px;font-weight:700;text-decoration:none;padding:8px 14px;border-radius:6px;background:#0A1E3D;color:#fff}" +
      ".jc-ev .a a+a{background:transparent;color:#0A1E3D;border:1px solid #0A1E3D}.jc-ev-empty{color:#5c6672}";
    document.head.appendChild(css);
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-jc-events]"), function (box) {
    var type = box.getAttribute("data-type") || "";
    box.innerHTML = '<p class="jc-ev-empty">Loading events…</p>';
    fetch(API + (type ? "&type=" + encodeURIComponent(type) : ""))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var items = d.items || [];
        if (!items.length) {
          box.innerHTML = '<p class="jc-ev-empty">' + esc(box.getAttribute("data-empty") || "No events scheduled right now. Check back soon.") + "</p>";
          return;
        }
        box.innerHTML = items.map(function (e) {
          var m = maps(e), fee = Number(e.fee_amount) > 0 ? "$" + Number(e.fee_amount).toFixed(2) : "Free";
          return '<div class="jc-ev"><div class="k">' + esc(LABEL[e.type] || e.type) + " · " + fee + "</div>" +
            "<h3>" + esc(e.title) + '</h3><div class="w">' + esc(when(e)) +
            (e.city ? " · " + esc(e.city) : "") + (e.meeting_address ? " · " + esc(e.meeting_address) : "") + "</div>" +
            (e.description ? "<p>" + esc(e.description) + "</p>" : "") +
            '<div class="a">' + (m ? '<a href="' + esc(m) + '" target="_blank" rel="noopener">Directions</a>' : "") +
            (e.organizer_phone ? '<a href="tel:' + esc(String(e.organizer_phone).replace(/[^0-9+]/g, "")) + '">Call ' + esc(e.organizer_phone) + "</a>" : "") +
            "</div></div>";
        }).join("");
      })
      .catch(function () { box.innerHTML = '<p class="jc-ev-empty">Events could not be loaded right now.</p>'; });
  });
})();
