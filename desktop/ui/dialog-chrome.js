/* Shared close control: delegate to the original action so its guards still apply. */
(function () {
  function originalClose(dialog) {
    const buttons = [...dialog.querySelectorAll('button')].filter(button => !button.closest('.dialog-close-bar'));
    return buttons.find(button => /닫기|close/i.test(button.getAttribute('aria-label') || '') || /(?:close|cancel|update-later)$/.test(button.id))
      || buttons.find(button => /^(닫기|취소|나중에|×|✕)$/.test(button.textContent.trim()));
  }
  function enhance(dialog) {
    let bar = dialog.querySelector(':scope > .dialog-close-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'dialog-close-bar';
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'dialog-close-button';
      close.setAttribute('aria-label', '창 닫기');
      close.title = '닫기';
      close.textContent = '×';
      close.onclick = () => {
        const original = originalClose(dialog);
        if (original) { if (!original.matches(':disabled')) original.click(); }
        else if (dialog.dispatchEvent(new Event('cancel', {cancelable: true}))) dialog.close();
      };
      bar.append(close);
      dialog.prepend(bar);
    }
    const original = originalClose(dialog);
    const disabled = Boolean(original?.matches(':disabled'));
    if (bar.firstChild.disabled !== disabled) bar.firstChild.disabled = disabled;
  }
  const update = () => document.querySelectorAll('dialog').forEach(enhance);
  new MutationObserver(update).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'open']});
  update();
})();
