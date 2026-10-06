# P4-176 Larger startup window

Desktop 0.147.13. Default window is 1660 x 1040 logical pixels, centered within the chosen display work area. Smaller work areas constrain each dimension with a 10 pixel margin. Resizing remains available. Both ordinary and right-display launches use the same sizing helper; ready-to-show reapplies bounds because the installed Windows runtime sometimes relocated the initial hidden window to the primary display.

Validation: 452 unit tests passed, placement suite 5/5 rechecked after ready-to-show fix; syntax and diff checks passed. Final packaged asar 117 files verified. Installed executable launched twice with the real owner profile, both measured x2570/y344/1060x1040 within right work area x2560/y-72/1080x1872. Search open/close passed each time. No order or credential mutations. Screenshots D:/GPT/tmp/p4176-installed-0.png and p4176-installed-1.png. Final distribution distribution-20260915-042059-485.
