#!/usr/bin/env python3

"""Stub viewer for the Lifetree central oak illustration."""

from __future__ import annotations

import tkinter as tk


WIDTH = 560
HEIGHT = 560


def draw_tree(canvas: tk.Canvas) -> None:
    canvas.create_oval(24, 24, WIDTH - 24, HEIGHT - 24, fill="#f7f2e7", outline="#e3d8c1", width=10)
    canvas.create_arc(24, 24, WIDTH - 24, HEIGHT - 24, start=215, extent=110, style="arc", outline="#ffffff", width=8)

    canvas.create_polygon(
        70, 392,
        160, 348,
        280, 332,
        400, 352,
        490, 394,
        490, 510,
        70, 510,
        fill="#6fb05b",
        outline="",
    )
    canvas.create_polygon(
        120, 404,
        198, 384,
        280, 378,
        362, 388,
        430, 408,
        430, 432,
        120, 432,
        fill="#86c96e",
        outline="",
    )

    canvas.create_polygon(
        248, 362,
        236, 198,
        272, 198,
        288, 362,
        fill="#744828",
        outline="",
    )
    canvas.create_line(252, 240, 192, 140, fill="#744828", width=12, capstyle=tk.ROUND)
    canvas.create_line(270, 232, 340, 132, fill="#744828", width=11, capstyle=tk.ROUND)
    canvas.create_line(248, 210, 208, 102, fill="#744828", width=10, capstyle=tk.ROUND)

    canopy = [
        (198, 190, 130, "#4f8d49"),
        (278, 128, 144, "#5aa24f"),
        (344, 198, 126, "#4f944a"),
        (260, 228, 154, "#63a954"),
        (166, 244, 96, "#5aa04a"),
        (378, 246, 98, "#5ca34e"),
    ]
    for x, y, radius, color in canopy:
        canvas.create_oval(x - radius / 2, y - radius / 2, x + radius / 2, y + radius / 2, fill=color, outline="")

    for x, y, color in [(214, 148, "#88c26d"), (292, 106, "#92cb73"), (350, 196, "#86bf68"), (230, 222, "#8bc96d")]:
        canvas.create_oval(x - 7, y - 7, x + 7, y + 7, fill=color, outline="")


def main() -> None:
    root = tk.Tk()
    root.title("Lifetree Oak Stub")
    root.configure(bg="#efe6d6")

    canvas = tk.Canvas(root, width=WIDTH, height=HEIGHT, bg="#efe6d6", highlightthickness=0)
    canvas.pack(padx=20, pady=20)
    draw_tree(canvas)

    label = tk.Label(
        root,
        text="Stub oak-tree hub for Lifetree",
        bg="#efe6d6",
        fg="#253243",
        font=("Trebuchet MS", 14, "bold"),
    )
    label.pack(pady=(0, 18))

    root.mainloop()


if __name__ == "__main__":
    main()
