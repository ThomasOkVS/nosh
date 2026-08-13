import "@testing-library/jest-dom";

// jsdom (as of the version this project pins) doesn't implement
// HTMLDialogElement's imperative methods, even though every real browser has
// supported them for years — without this, any component using a native
// <dialog> throws in tests despite working correctly in an actual browser.
if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}
