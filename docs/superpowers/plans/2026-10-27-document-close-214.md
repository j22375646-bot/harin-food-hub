# 0.214.0 document notice close control

User requested refining the oversized outlined X on the document preparation toast.

CSS-only change: 32px transparent icon button, centered vertically, no visible resting border, thin 13px crossed strokes instead of font-dependent ×, quiet hover fill, retained keyboard focus outline and disabled behavior. Only this toast close control is affected. Document preparation, printing and close handlers are unchanged.

Source visible isolated Electron test passed in both themes: 32px dimensions, centered within the notice, 1.5px icon strokes, transparent resting border, keyboard dismissal, and disabled close preserving the notice. No real document generation, print or shipment writes. Verification windows use a separate profile and explicitly identify synthetic test data on the right monitor without native focus.

Three stages: presentation, source/installed verification, signed release publication. Separate performance roadmap remains 3/6 complete, with stage 4 rendering/selection/scroll preservation next. Evidence: D:/GPT/Temp/moaon-document-close-214.

Installed 0.214.0 app.asar passed the same visible test with development Electron and an isolated profile, distinct from the running authenticated user EXE. Package verified 165 files, SHA256 79939973b55f9978e26c9280eeabc50eedbe5e1477140429ffb83116690b1e00. Distribution desktop/dist/distribution-20261027-031534-145; installer 114,465,835 bytes, SHA256 ef762a2b4c144031f0f4a9059c41b075cdc519045c6689b8d0dc46cde6c720f1. Pinned Ed25519 signing retained; Windows Authenticode NotSigned. Local release and launchers staged without forcibly restarting the user's app. Public verification evidence is recorded under the evidence directory's public folder.
