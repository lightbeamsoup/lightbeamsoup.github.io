#!/usr/bin/env python3

"""Interactive stub viewer for the Lifetree central oak and fruit growth."""

from __future__ import annotations

import math
import tkinter as tk
from dataclasses import dataclass


WIDTH = 560
HEIGHT = 560

CATEGORIES = [
    ("fun", "Fun", "#f4b64e"),
    ("friends", "Friends", "#5ca8f5"),
    ("family", "Family", "#f28ca8"),
    ("productivity", "Productivity", "#7dbf74"),
    ("health", "Health", "#6dc7bf"),
]

FRUIT_STAGE_SIZES = {1: 14, 2: 18, 3: 22, 4: 26, 5: 30}
FRUIT_CLUSTER_OFFSETS = [(-18, 14), (0, -18), (18, 12)]


@dataclass
class Fruit:
    category_key: str
    category_label: str
    color: str
    stage: int
    points: int
    ripe: bool
    left: float
    top: float


def build_fruit_slots(points: int) -> list[tuple[int, int, bool]]:
    fruits: list[tuple[int, int, bool]] = []
    for slot_index in range(3):
        slot_points = max(0, min(25, points - (slot_index * 25)))
        if slot_points <= 0:
            continue
        stage = min(5, (slot_points + 4) // 5)
        fruits.append((stage, slot_points, slot_points >= 21))
    return fruits


def compute_cluster_anchor(index: int, count: int) -> tuple[float, float]:
    if count <= 1:
        return 280, 184
    start_angle = 205
    end_angle = 335
    angle = start_angle + ((end_angle - start_angle) * index) / max(count - 1, 1)
    radians = math.radians(angle)
    return (
        280 + math.cos(radians) * 150,
        230 + math.sin(radians) * 92,
    )


def build_fruit_layout(growth_points: dict[str, int]) -> list[Fruit]:
    active_categories = []
    for key, label, color in CATEGORIES:
        points = max(0, int(growth_points.get(key, 0)))
        slots = build_fruit_slots(points)
        if slots:
            active_categories.append((key, label, color, slots))

    fruits: list[Fruit] = []
    for category_index, (key, label, color, slots) in enumerate(active_categories):
        anchor_x, anchor_y = compute_cluster_anchor(category_index, len(active_categories))
        for fruit_index, (stage, points, ripe) in enumerate(slots):
            offset_x, offset_y = FRUIT_CLUSTER_OFFSETS[fruit_index]
            fruits.append(
                Fruit(
                    category_key=key,
                    category_label=label,
                    color=color,
                    stage=stage,
                    points=points,
                    ripe=ripe,
                    left=anchor_x + offset_x,
                    top=anchor_y + offset_y,
                )
            )
    return fruits


def draw_tree(canvas: tk.Canvas, growth_points: dict[str, int], banked_points: int) -> None:
    canvas.delete("all")
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

    for fruit in build_fruit_layout(growth_points):
        size = FRUIT_STAGE_SIZES[fruit.stage]
        canvas.create_line(fruit.left, fruit.top - (size / 2) - 6, fruit.left, fruit.top - (size / 2) + 1, fill="#7a4b28", width=2)
        canvas.create_oval(
            fruit.left + 2,
            fruit.top - (size / 2) - 6,
            fruit.left + 10,
            fruit.top - (size / 2),
            fill="#6dc46d",
            outline="",
        )
        canvas.create_oval(
            fruit.left - (size / 2),
            fruit.top - (size / 2),
            fruit.left + (size / 2),
            fruit.top + (size / 2),
            fill=fruit.color,
            outline="#7a4b28" if fruit.ripe else "",
            width=3 if fruit.ripe else 0,
        )
        canvas.create_oval(
            fruit.left - (size * 0.18),
            fruit.top - (size * 0.22),
            fruit.left + (size * 0.02),
            fruit.top - (size * 0.02),
            fill="#ffffff",
            outline="",
        )

    canvas.create_text(
        WIDTH / 2,
        HEIGHT - 28,
        text=f"Banked reward points: {banked_points}",
        fill="#253243",
        font=("Trebuchet MS", 13, "bold"),
    )


class LifetreeStub:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("Lifetree Oak Stub")
        self.root.configure(bg="#efe6d6")

        self.canvas = tk.Canvas(self.root, width=WIDTH, height=HEIGHT, bg="#efe6d6", highlightthickness=0)
        self.canvas.pack(padx=20, pady=20)

        self.growth_points: dict[str, int] = {
            "fun": 8,
            "friends": 14,
            "family": 22,
            "productivity": 37,
            "health": 55,
        }
        self.banked_points = 0
        self.selected_category = tk.StringVar(value=CATEGORIES[0][0])

        self.canvas.bind("<Button-1>", lambda _event: self.harvest_ripe_fruit())

        info = tk.Label(
            self.root,
            text="Click the tree to harvest ripe fruit. Use the controls below to add or remove growth points by category.",
            bg="#efe6d6",
            fg="#253243",
            wraplength=700,
            justify="center",
            font=("Trebuchet MS", 12),
        )
        info.pack(pady=(0, 12))

        controls = tk.Frame(self.root, bg="#efe6d6")
        controls.pack(pady=(0, 10))

        tk.Label(controls, text="Category", bg="#efe6d6", fg="#253243").grid(row=0, column=0, padx=6, pady=4)
        option = tk.OptionMenu(controls, self.selected_category, *[key for key, _label, _color in CATEGORIES])
        option.grid(row=0, column=1, padx=6, pady=4)

        for column, (label, delta) in enumerate([("-25", -25), ("-5", -5), ("+5", 5), ("+25", 25)], start=2):
            tk.Button(
                controls,
                text=label,
                command=lambda delta=delta: self.adjust_growth(delta),
                width=6,
            ).grid(row=0, column=column, padx=4, pady=4)

        tk.Button(controls, text="Harvest ripe", command=self.harvest_ripe_fruit).grid(row=0, column=6, padx=8, pady=4)
        tk.Button(controls, text="Reset", command=self.reset_points).grid(row=0, column=7, padx=4, pady=4)

        self.summary_label = tk.Label(
            self.root,
            bg="#efe6d6",
            fg="#5b6a7c",
            justify="center",
            font=("Trebuchet MS", 11),
        )
        self.summary_label.pack(pady=(0, 18))

        self.render()

    def adjust_growth(self, delta: int) -> None:
        key = self.selected_category.get()
        self.growth_points[key] = max(0, self.growth_points.get(key, 0) + delta)
        self.render()

    def harvest_ripe_fruit(self) -> None:
        harvested = 0
        for key, _label, _color in CATEGORIES:
            points = self.growth_points.get(key, 0)
            ripe_points = sum(slot_points for _stage, slot_points, ripe in build_fruit_slots(points) if ripe)
            if ripe_points > 0:
                self.growth_points[key] = max(0, points - ripe_points)
                harvested += ripe_points
        self.banked_points += harvested
        self.render()

    def reset_points(self) -> None:
        self.growth_points = {key: 0 for key, _label, _color in CATEGORIES}
        self.banked_points = 0
        self.render()

    def render(self) -> None:
        draw_tree(self.canvas, self.growth_points, self.banked_points)
        summary = " | ".join(
            f"{label}: {self.growth_points.get(key, 0)}"
            for key, label, _color in CATEGORIES
        )
        self.summary_label.config(text=f"Growing points by category: {summary}")

    def run(self) -> None:
        self.root.mainloop()


def main() -> None:
    LifetreeStub().run()


if __name__ == "__main__":
    main()
