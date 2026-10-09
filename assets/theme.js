const toggle = document.querySelector('#theme-toggle');
const root = document.documentElement;

function setTheme(theme) {
  root.dataset.theme = theme;
  const light = theme === 'light';
  toggle.innerHTML = `<span aria-hidden="true">${light ? '☾' : '☀'}</span> ${light ? 'Dark' : 'Light'} mode`;
  toggle.setAttribute('aria-label', `Switch to ${light ? 'dark' : 'light'} mode`);
}

let savedTheme;
try {
  savedTheme = localStorage.getItem('retro-arcade-theme');
} catch {}
setTheme(savedTheme === 'light' ? 'light' : 'dark');

toggle.addEventListener('click', () => {
  const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(theme);
  try {
    localStorage.setItem('retro-arcade-theme', theme);
  } catch {}
});
