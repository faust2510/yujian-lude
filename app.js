document.documentElement.classList.replace('no-js', 'js');

const body = document.body;
const header = document.querySelector('[data-header]');
const nav = document.querySelector('#site-nav');
const navToggle = document.querySelector('.nav-toggle');
const year = document.querySelector('[data-year]');
const desktopMedia = window.matchMedia('(min-width: 901px)');
const orientationMedia = window.matchMedia('(orientation: portrait)');

function headerFocusableItems() {
  const menuItems = nav ? [...nav.querySelectorAll('a')] : [];
  const headerActions = [...document.querySelectorAll('.header-actions a')];
  return [...menuItems, ...headerActions, navToggle]
    .filter((element) => element?.offsetParent !== null);
}

function setMenu(open, { restoreFocus = false } = {}) {
  body.classList.toggle('menu-open', open);
  navToggle?.setAttribute('aria-expanded', String(open));
  navToggle?.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');

  if (open) {
    window.setTimeout(() => nav?.querySelector('a')?.focus(), 0);
  } else if (restoreFocus) {
    navToggle?.focus();
  }
}

navToggle?.addEventListener('click', () => {
  setMenu(!body.classList.contains('menu-open'));
});

nav?.addEventListener('click', (event) => {
  if (event.target.closest('a')) setMenu(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && body.classList.contains('menu-open')) {
    setMenu(false, { restoreFocus: true });
    return;
  }

  if (event.key === 'Tab' && body.classList.contains('menu-open')) {
    const focusable = headerFocusableItems();
    const first = focusable[0];
    const last = focusable.at(-1);

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
});

desktopMedia.addEventListener('change', (event) => {
  if (event.matches) setMenu(false);
});

orientationMedia.addEventListener('change', () => {
  setMenu(false);
});

window.addEventListener('scroll', () => {
  header?.classList.toggle('is-scrolled', window.scrollY > 12);
}, { passive: true });

const revealItems = document.querySelectorAll('.reveal');
const relationshipLines = document.querySelectorAll('.relationship-line');
const animatedItems = [...revealItems, ...relationshipLines];

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });

  animatedItems.forEach((item) => observer.observe(item));
} else {
  animatedItems.forEach((item) => item.classList.add('is-visible'));
}

if (year) year.textContent = String(new Date().getFullYear());
