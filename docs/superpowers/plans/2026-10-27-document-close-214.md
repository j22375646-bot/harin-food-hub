# 0.214.0 document notice close control

User requested refining the oversized outlined X on the document preparation toast.

CSS-only change: 32px transparent icon button, centered vertically, no visible resting border, thin 13px crossed strokes instead of font-dependent ×, quiet hover fill, retained keyboard focus outline and disabled behavior. Only this toast close control is affected. Document preparation, printing and close handlers are unchanged.

Source visible isolated Electron test passed in both themes: 32px dimensions, centered within the notice, 1.5px icon strokes, transparent resting border, keyboard dismissal, and disabled close preserving the notice. No real document generation, print or shipment writes. Verification windows use a separate profile and explicitly identify synthetic test data on the right monitor without native focus.

Three stages: presentation, source/installed verification, signed release publication. Separate performance roadmap remains 3/6 complete, with stage 4 rendering/selection/scroll preservation next. Evidence: D:/GPT/Temp/moaon-document-close-214.
