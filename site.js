/* BUILT 2026-09-29 · jobcreation site-2a · Shared page script for the pages built from the 2026-09-29 layout:
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

  // ---- Cars for Homeless (site-2a) ----
  function money(n) { return "$" + Math.round(n).toLocaleString("en-US"); }

  // Approved applicants donors can choose from (first name + state + story only).
  var listBox = document.getElementById("applicantList"), chosenSel = document.getElementById("chosenSelect");
  if (listBox) {
    fetch("/api/cars?public=approved").then(function (r) { return r.json(); }).then(function (d) {
      var items = d.items || [];
      if (!items.length) { listBox.innerHTML = '<p class="form-note">No applicants have finished their checks yet. You can still pledge now and choose later, or ask us to suggest someone.</p>'; return; }
      listBox.innerHTML = items.map(function (a) {
        return '<div class="applicant-card"><h3>' + esc(a.firstName) + ", " + esc(a.state) + '</h3><div class="why">' + esc(a.reason) +
          " · waiting since " + esc(a.waitingSince) + "</div><p>" + esc(a.story) + '</p><button type="button" class="btn btn-ghost pick" data-id="' +
          a.id + '">Give my car to ' + esc(a.firstName) + "</button></div>";
      }).join("");
      if (chosenSel) items.forEach(function (a) {
        var o = document.createElement("option"); o.value = a.id; o.textContent = a.firstName + ", " + a.state; chosenSel.appendChild(o);
      });
      listBox.addEventListener("click", function (e) {
        var b = e.target.closest(".pick"); if (!b || !chosenSel) return;
        chosenSel.value = b.dataset.id; document.getElementById("donate").scrollIntoView({ behavior: "smooth" });
      });
    }).catch(function () { listBox.innerHTML = '<p class="form-note">The list could not be loaded right now.</p>'; });
  }

  // Estimated charitable deduction, shown as the donor types the car's value.
  var est = document.getElementById("estValue"), ded = document.getElementById("deduction");
  if (est && ded) {
    est.addEventListener("input", function () {
      var v = parseFloat(String(est.value).replace(/[^0-9.]/g, "")) || 0;
      if (!v) { ded.innerHTML = ""; return; }
      ded.innerHTML = "<b>Your estimated charitable deduction: up to " + money(v) + "</b>, the car&rsquo;s fair market value, because the Foundation gives it directly to a person in need instead of selling it." +
        "<br>Tax saved if you itemize: about " + money(v * 0.12) + " at a 12% bracket, " + money(v * 0.22) + " at 22%, " + money(v * 0.24) + " at 24%." +
        (v > 5000 ? "<br>Over $5,000 you will generally need a qualified appraisal (IRS Form 8283)." : v > 500 ? "<br>You will receive IRS Form 1098-C from the Foundation." : "") +
        '<br><span class="form-note">An estimate, not tax advice. See IRS Publication 4303.</span>';
    });
  }

  // Car photo: shrink in the browser to at most 1000 px before sending.
  var photoIn = document.getElementById("carPhoto"), photoData = "";
  if (photoIn) photoIn.addEventListener("change", function () {
    var file = photoIn.files && photoIn.files[0]; photoData = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var im = new Image();
      im.onload = function () {
        var sc = Math.min(1, 1000 / Math.max(im.width, im.height)), c = document.createElement("canvas");
        c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        photoData = c.toDataURL("image/jpeg", 0.72);
        var pv = document.getElementById("carPhotoPreview"); if (pv) { pv.src = photoData; pv.style.display = "block"; }
      };
      im.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  // Donor pledge and application forms: saved through /api/cars. If the database can't be reached,
  // fall back to a pre-filled email (without the photo) so no sign-up is lost.
  Array.prototype.forEach.call(document.querySelectorAll("form.mailform"), function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = { kind: f.dataset.kind }, lines = [];
      Array.prototype.forEach.call(f.elements, function (el) {
        if (!el.name || el.type === "file") return;
        var v = el.type === "checkbox" ? el.checked : el.value;
        data[el.name] = v;
        if (el.name !== "website") lines.push(el.name + ": " + (el.type === "checkbox" ? (v ? "Yes" : "No") : v));
      });
      if (f.dataset.kind === "donor" && photoData) data.Photo = photoData;
      if (!data.Phone && !data.Email && !data.Contact) { alert("Please give a phone number or an email so we can reach you."); return; }
      var btn = f.querySelector("button[type=submit]"), label = btn.textContent;
      btn.disabled = true; btn.textContent = "Sending…";
      var mail = function () {
        lines.push("", "Sent from " + location.href + " on " + new Date().toLocaleString());
        location.href = "mailto:realroofers@gmail.com?subject=" + encodeURIComponent(f.dataset.subject) +
          "&body=" + encodeURIComponent(lines.join("\n"));
      };
      fetch("/api/cars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
        .then(function (res) {
          if (res.ok) {
            f.innerHTML = data.kind === "donor"
              ? '<h3>Thank you</h3><p>We have your pledge' + (res.d.chosen ? " and the person you chose" : "") + '. We will call or write to arrange the title transfer and pickup. Questions? Call <a href="tel:+17329953914">732-995-3914</a>.</p>'
              : '<h3>Thank you. Your application is in.</h3><p>We will contact you about the license and driving-record check, the background check and the drug test. Approval does not guarantee a car: donors choose who receives their car. Questions? Call <a href="tel:+17329953914">732-995-3914</a>.</p>';
            f.scrollIntoView({ behavior: "smooth" });
          } else if (res.status === 400 || res.status === 429) {
            alert(res.d.error || "Please check the form."); btn.disabled = false; btn.textContent = label;
          } else { mail(); btn.disabled = false; btn.textContent = label; }
        })
        .catch(function () { mail(); btn.disabled = false; btn.textContent = label; });
    });
  });
})();
