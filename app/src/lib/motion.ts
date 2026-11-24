// Design §7 (Motion): spring pills and soft ease-out reveals.
export const spring = { type: "spring", stiffness: 420, damping: 34 } as const;
export const easeOut = [0.22, 1, 0.36, 1] as const;
