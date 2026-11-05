/* Shared behaviour for the case study pages: site switcher, mobile menu,
   in-page active link, copy-email and reveal-on-scroll. */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Close the site switcher on an outside click or Escape. */
  function initSwitcher() {
    const menu = $('[data-switcher]');
    document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    menu.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !menu.open) return;
      menu.open = false;
      $('summary', menu).focus();
    });
  }

  /** Mobile menu sheet: modal dialog that closes on link, backdrop or button and returns focus. */
  function initMenu() {
    const sheet = $('#menu');
    const opener = $('[data-menu-open]');
    opener.addEventListener('click', () => { sheet.showModal(); opener.setAttribute('aria-expanded', 'true'); });
    $('[data-menu-close]').addEventListener('click', () => sheet.close());
    sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('a')) sheet.close(); });
    sheet.addEventListener('close', () => { opener.setAttribute('aria-expanded', 'false'); opener.focus({ preventScroll: true }); });
  }

  /** Mark same-page nav links (href="#…") whose section is in the middle of the viewport. */
  function initActiveNav() {
    const links = $$('[data-nav-link][href^="#"]');
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => (a.hash === '#' + e.target.id ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    }), { rootMargin: '-45% 0px -50% 0px' });
    $$('main > section[id]').forEach((s) => io.observe(s));
  }

  /** Copy the email address and report the result on the button and to screen readers. */
  function initCopy() {
    const btn = $('[data-copy]');
    const label = $('[data-copy-label]', btn);
    const status = $('[data-copy-status]');
    const email = btn.dataset.copy;
    btn.addEventListener('click', async () => {
      const ok = await navigator.clipboard.writeText(email).then(() => true, () => false);
      btn.classList.toggle('is-done', ok);
      label.textContent = ok ? 'Copied' : 'Copy failed';
      status.textContent = ok ? 'Email address copied' : 'Could not copy. The address is ' + email;
      clearTimeout(btn.resetTimer);
      btn.resetTimer = setTimeout(() => { btn.classList.remove('is-done'); label.textContent = 'Copy email'; }, 2400);
    });
  }

  /** Fade blocks in as they enter the viewport; skipped under reduced motion. */
  function initReveal() {
    if (reduceMotion) return;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      e.target.addEventListener('transitionend', () => e.target.classList.remove('will-reveal', 'is-in'), { once: true });
      io.unobserve(e.target);
    }), { threshold: 0.08 });
    $$('[data-reveal]').forEach((el) => {
      if (el.getBoundingClientRect().top < innerHeight * 0.92) return;
      el.classList.add('will-reveal');
      io.observe(el);
    });
  }

  initSwitcher();
  initMenu();
  initActiveNav();
  initCopy();
  initReveal();
})();
