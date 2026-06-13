export function supportsWebHid() {
  return typeof navigator !== "undefined" && "hid" in navigator;
}
