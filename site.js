/* BUILT 2026-09-29 · jobcreation site-1a · Shared page script for the pages built from the 2026-09-29 layout:
   mobile menu, footer year, photo lightbox, the Jobs & Growth feed (news.html), and the Cars for Homes mail forms. */
(function () {
  var toggle = document.getElementById("menuToggle");
  var nav = document.getElementById("nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") nav.classList.remove("open");
    });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // Photo lightbox
  var box = document.getElementById("lightbox");
  if (box) {
    var img = box.querySelector("img");
    document.addEventListener("click", function (e) {
      var fig = e.target.closest(".gallery figure");
      if (!fig) return;
      img.src = fig.dataset.full;
      img.alt = fig.querySelector("img").alt;
      box.classList.add("open");
      document.body.style.overflow = "hidden";
    });
    var close = function () { box.classList.remove("open"); document.body.style.overflow = ""; img.src = ""; };
    box.addEventListener("click", close);
    document.getElementById("lightboxClose").addEventListener("click", close);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Jobs & Growth feed
  var list = document.getElementById("feedList");
  var filters = document.getElementById("feedFilters");
  if (list && filters) {
    var allItems = [], activeCat = "all";
    var timeAgo = function (iso) {
      var mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
      if (isNaN(mins)) return "";
      if (mins < 60) return mins + "m ago";
      var hrs = Math.floor(mins / 60);
      return hrs < 24 ? hrs + "h ago" : Math.floor(hrs / 24) + "d ago";
    };
    var render = function () {
      var items = activeCat === "all" ? allItems : allItems.filter(function (i) { return i.category === activeCat; });
      if (!items.length) { list.innerHTML = '<div class="feed-empty">No headlines in this section right now. Check back shortly.</div>'; return; }
      list.innerHTML = items.slice(0, 40).map(function (it) {
        return '<a class="feed-item" href="' + esc(it.link) + '" target="_blank" rel="noopener">' +
          '<span class="cat">' + esc(it.categoryLabel) + '</span>' +
          '<h4>' + esc(it.title) + '</h4>' +
          '<span class="src">' + esc(it.source || "") + ' · ' + esc(timeAgo(it.pubDate)) + '</span></a>';
      }).join("");
    };
    filters.addEventListener("click", function (e) {
      if (e.target.tagName !== "BUTTON") return;
      activeCat = e.target.dataset.cat;
      Array.prototype.forEach.call(filters.querySelectorAll("button"), function (b) { b.classList.toggle("active", b === e.target); });
      render();
    });
    fetch("/api/feed").then(function (r) { return r.json(); })
      .then(function (d) { allItems = d.items || []; render(); })
      .catch(function () { list.innerHTML = '<div class="feed-empty">Headlines are unavailable right now.</div>'; });
  }

  // Mail forms (Cars for Homes): open a pre-filled email to the Foundation. Nothing is stored on the site.
  Array.prototype.forEach.call(document.querySelectorAll("form.mailform"), function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var lines = [];
      Array.prototype.forEach.call(f.elements, function (el) {
        if (el.name) lines.push(el.name + ": " + el.value);
      });
      lines.push("", "Sent from " + location.href + " on " + new Date().toLocaleString());
      location.href = "mailto:realroofers@gmail.com?subject=" + encodeURIComponent(f.dataset.subject) +
        "&body=" + encodeURIComponent(lines.join("\n"));
    });
  });
})();
