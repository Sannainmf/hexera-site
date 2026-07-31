/* ============================================================
   Hexera — waitlist modal + Supabase capture.
   One shared popup (name + email) opened by every "Join waitlist"
   CTA; the footer email forms hand off into it with the email
   prefilled. Inserts go straight to Supabase REST with the anon
   key. The anon key is public by design; the table's row-level
   security only permits inserts, so the list can never be read
   from the browser.
   ============================================================ */
(() => {
  "use strict";

  const SUPABASE_URL = "https://kypejrktlvmeutgoexyl.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5cGVqcmt0bHZtZXV0Z29leHlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NTE5NDksImV4cCI6MjA5ODUyNzk0OX0.Xfw8YAMtK2AfNRHuMm-flWEgNrMfYSyrHAzgU1EvaDY";

  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- markup ---------- */
  const overlay = document.createElement("div");
  overlay.className = "wl-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="wl-panel" role="dialog" aria-modal="true" aria-labelledby="wlTitle">
      <i class="wl-corner wl-corner--tl" aria-hidden="true"></i>
      <i class="wl-corner wl-corner--tr" aria-hidden="true"></i>
      <i class="wl-corner wl-corner--bl" aria-hidden="true"></i>
      <i class="wl-corner wl-corner--br" aria-hidden="true"></i>
      <button class="wl-close" type="button" aria-label="Close">&times;</button>
      <h3 class="wl-title" id="wlTitle">Get in the <em>queue</em>.</h3>
      <p class="wl-sub">Leave a name and an email. We reach out as access opens.</p>
      <form class="wl-form" novalidate>
        <label class="wl-label" for="wlName">Name</label>
        <input class="wl-input" id="wlName" name="name" type="text" autocomplete="name" placeholder="Your name" required />
        <label class="wl-label" for="wlEmail">Email</label>
        <input class="wl-input" id="wlEmail" name="email" type="email" autocomplete="email" placeholder="Your email" required />
        <label class="wl-label" for="wlCompany">Company</label>
        <input class="wl-input" id="wlCompany" name="company" type="text" autocomplete="organization" placeholder="Company, lab or school" />
        <button class="wl-submit" type="submit">Join waitlist <span aria-hidden="true">&rarr;</span></button>
        <p class="wl-note" role="status" aria-live="polite"></p>
      </form>
    </div>`;

  const form = overlay.querySelector(".wl-form");
  const nameInput = overlay.querySelector("#wlName");
  const emailInput = overlay.querySelector("#wlEmail");
  const companyInput = overlay.querySelector("#wlCompany");
  const submitBtn = overlay.querySelector(".wl-submit");
  const note = overlay.querySelector(".wl-note");
  const closeBtn = overlay.querySelector(".wl-close");

  let lastFocus = null;
  let submitting = false;

  function mount() {
    if (!overlay.isConnected) document.body.appendChild(overlay);
  }

  function open(prefillEmail) {
    mount();
    lastFocus = document.activeElement;
    overlay.hidden = false;
    void overlay.offsetHeight; /* reflow so the entrance still transitions */
    overlay.classList.add("is-open");
    if (prefillEmail) emailInput.value = prefillEmail;
    nameInput.focus();
    document.documentElement.classList.add("wl-lock");
  }

  function close() {
    overlay.classList.remove("is-open");
    document.documentElement.classList.remove("wl-lock");
    const done = () => { overlay.hidden = true; };
    reduce ? done() : setTimeout(done, 220);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function setNote(text, state) {
    note.textContent = text;
    note.dataset.state = state || "";
  }

  /* ---------- submit ---------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitting) return;

    const name = (nameInput.value || "").trim();
    const email = (emailInput.value || "").trim().toLowerCase();
    const company = (companyInput.value || "").trim();

    if (!name) { setNote("Please enter your name.", "err"); nameInput.focus(); return; }
    if (!EMAIL_RE.test(email)) { setNote("Please enter a valid email.", "err"); emailInput.focus(); return; }

    submitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = "Joining…";
    setNote("", "");

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        /* company is nullable — send null rather than "" so blank rows stay
           empty in the table instead of holding an empty string */
        body: JSON.stringify({ name, email, company: company || null }),
      });

      if (res.status === 201) {
        setNote("You're on the list. We'll be in touch.", "ok");
        form.reset();
        nameInput.disabled = true;
        emailInput.disabled = true;
        companyInput.disabled = true;
        submitBtn.textContent = "You're in";
      } else if (res.status === 409) {
        setNote("This email is already on the list.", "ok");
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Join waitlist <span aria-hidden="true">&rarr;</span>';
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      setNote("Something went wrong. Please try again.", "err");
      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Join waitlist <span aria-hidden="true">&rarr;</span>';
    } finally {
      submitting = false;
    }
  });

  /* ---------- close interactions ---------- */
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("pointerdown", (e) => { if (e.target === overlay) close(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden) close();
  });

  /* ---------- CTA takeover: every "Join waitlist" link opens the modal ---------- */
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href$="contact.html"]');
    if (!a) return;
    if (!/join\s*waitlist/i.test(a.textContent || "")) return;
    e.preventDefault();
    open();
  });

  /* ---------- footer email forms hand off into the modal ---------- */
  document.querySelectorAll("[data-access-form]").forEach((f) => {
    const input = f.querySelector('input[type="email"]');
    const n = f.parentElement.querySelector("[data-access-note]");
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = (input.value || "").trim();
      if (v && !EMAIL_RE.test(v)) {
        if (n) { n.textContent = "Please enter a valid email."; n.dataset.state = "err"; }
        input.focus();
        return;
      }
      if (n) { n.textContent = ""; n.dataset.state = ""; }
      open(v || "");
    });
  });
})();
