const previewArea = document.querySelector('main');
const stage = document.querySelector('.phone-stage');
const phone = document.querySelector('.phone');

function fitPhone() {
  const style = getComputedStyle(previewArea);
  const width = previewArea.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = previewArea.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const scale = Math.max(0, Math.min(1, width / phone.offsetWidth, height / phone.offsetHeight));
  stage.style.width = `${phone.offsetWidth * scale}px`;
  stage.style.height = `${phone.offsetHeight * scale}px`;
  phone.style.transform = `scale(${scale})`;
}

new ResizeObserver(fitPhone).observe(previewArea);
fitPhone();
