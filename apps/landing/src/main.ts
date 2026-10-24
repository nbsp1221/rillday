import './styles.css';

const toggle = document.querySelector<HTMLButtonElement>('#theme-toggle');
const media = window.matchMedia('(prefers-color-scheme: dark)');
let explicitTheme = localStorage.getItem('rillday-site-theme');

const applyTheme = () => {
  const dark = explicitTheme ? explicitTheme === 'dark' : media.matches;
  document.documentElement.classList.toggle('dark', dark);
  toggle?.setAttribute('aria-pressed', String(dark));
  toggle?.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
};

applyTheme();
media.addEventListener('change', applyTheme);
toggle?.addEventListener('click', () => {
  explicitTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  localStorage.setItem('rillday-site-theme', explicitTheme);
  applyTheme();
});
