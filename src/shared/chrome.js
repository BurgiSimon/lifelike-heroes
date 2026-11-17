// Page chrome of the demo pages. It lives outside the hero and only talks to it through update().
import './chrome.css';

export function chrome(hero) {
  const bar = document.createElement('div');
  bar.className = 'chrome';
  bar.innerHTML = '<button type="button" class="chrome__tab">Hide text</button>';
  const text = bar.firstChild; let bare = false;
  text.addEventListener('click', () => {
    bare = !bare;
    text.textContent = bare ? 'Show text' : 'Hide text';
    hero.update({ text: !bare });
  });
  document.body.append(bar);
}
