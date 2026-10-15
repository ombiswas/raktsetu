"""
RaktSetu Simulation Benchmark Analysis & Academic Report Generator
Generates thesis-ready comparative tables and matplotlib publication figures from raw simulation data.

CRITICAL PROTOCOL:
All tables and plots are strictly labeled "Simulation results" to signify academic evaluation.
"""

import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

# Set academic publication styling
plt.style.use("seaborn-v0_8-whitegrid" if "seaborn-v0_8-whitegrid" in plt.style.available else "default")
plt.rcParams["font.family"] = "sans-serif"
plt.rcParams["font.sans-serif"] = ["DejaVu Sans", "Arial", "Helvetica"]
plt.rcParams["axes.edgecolor"] = "#27272a"
plt.rcParams["axes.linewidth"] = 0.8
plt.rcParams["grid.color"] = "#e4e4e7"
plt.rcParams["grid.linestyle"] = "--"
plt.rcParams["grid.alpha"] = 0.7

BASE_DIR = Path(__file__).resolve().parent.parent
RESULTS_DIR = BASE_DIR / "results"
OUTPUT_DIR = BASE_DIR / "analysis"


def ensure_results_exist() -> None:
    metrics_path = RESULTS_DIR / "strategy_metrics.csv"
    if not metrics_path.exists():
        print(f"[ERROR] Raw simulation data not found at: {metrics_path}")
        print("Please run the simulation runner first:")
        print("  npm run exp:run -- --config experiments/configs/default.json")
        sys.exit(1)


def generate_tables() -> dict[str, pd.DataFrame]:
    print("\n" + "=" * 90)
    print("  Simulation results: Thesis Benchmark Tables (Multi-Strategy Comparative Analysis)")
    print("=" * 90)

    # 1. Strategy Summary Table
    metrics_df = pd.read_csv(RESULTS_DIR / "strategy_metrics.csv", comment="#")

    summary_rows = []
    strategies = ["baseline_proximity", "hybrid_full", "ablation_ml_only", "ablation_geo_only"]

    for strat in strategies:
        sub = metrics_df[metrics_df["strategy"] == strat]
        fr = sub["fulfilled"].mean() * 100
        top_k = sub["top_k_response_rate"].mean() * 100
        contacted = sub["donors_contacted"].mean()
        contacted_std = sub["donors_contacted"].std()
        dist = sub["mean_donor_distance_km"].mean()
        ttfa_sub = sub[sub["time_to_first_accept_sec"].notna()]["time_to_first_accept_sec"]
        ttfa = ttfa_sub.mean() if len(ttfa_sub) > 0 else np.nan

        summary_rows.append({
            "Strategy": strat,
            "Fulfillment Rate (%)": f"{fr:.1f}%",
            "Top-K Resp Rate (%)": f"{top_k:.1f}%",
            "Donors Alerted": f"{contacted:.1f} ± {contacted_std:.1f}",
            "TTFA (sec)": f"{ttfa:.1f}s" if not np.isnan(ttfa) else "N/A",
            "Mean Distance (km)": f"{dist:.2f} km",
        })

    summary_table = pd.DataFrame(summary_rows)
    print("\n[Table 1] Simulation results: Strategy Performance Comparison")
    print("-" * 90)
    print(summary_table.to_string(index=False))

    # 2. Paired Comparison Table
    paired_path = RESULTS_DIR / "paired_differences.csv"
    if paired_path.exists():
        paired_df = pd.read_csv(paired_path, comment="#")
        print("\n[Table 2] Simulation results: Paired Differences (Hybrid Full vs Baseline Proximity)")
        print("-" * 90)
        print(paired_df[["metric", "baseline_mean", "hybrid_mean", "mean_difference", "ci95_lower", "ci95_upper"]].to_string(index=False))

    # 3. Sensitivity Sweep Table
    sweep_path = RESULTS_DIR / "sensitivity_sweep.csv"
    sweep_df = pd.DataFrame()
    if sweep_path.exists():
        sweep_df = pd.read_csv(sweep_path, comment="#")
        print("\n[Table 3] Simulation results: Sensitivity Analysis Parameter Sweeps")
        print("-" * 90)
        print(sweep_df[["parameter", "value_label", "strategy", "fulfillment_rate", "top_k_response_rate", "mean_donor_distance_km"]].to_string(index=False))

    return {
        "summary": summary_table,
        "paired": pd.read_csv(paired_path, comment="#") if paired_path.exists() else pd.DataFrame(),
        "sweep": sweep_df,
    }


def plot_tradeoff(metrics_df: pd.DataFrame) -> None:
    """Figure 1: Response Rate vs Contact Distance Trade-off Curve."""
    fig, ax = plt.subplots(figsize=(8, 5.5), dpi=300)

    strategies = ["baseline_proximity", "hybrid_full", "ablation_ml_only", "ablation_geo_only"]
    colors = {
        "baseline_proximity": "#64748b",
        "hybrid_full": "#dc2626",
        "ablation_ml_only": "#2563eb",
        "ablation_geo_only": "#059669",
    }
    labels = {
        "baseline_proximity": "Baseline (Proximity)",
        "hybrid_full": "RaktSetu Hybrid (Proposed)",
        "ablation_ml_only": "Ablation: ML Only",
        "ablation_geo_only": "Ablation: Geo Only",
    }
    markers = {
        "baseline_proximity": "o",
        "hybrid_full": "s",
        "ablation_ml_only": "^",
        "ablation_geo_only": "D",
    }

    for strat in strategies:
        sub = metrics_df[metrics_df["strategy"] == strat]
        mean_dist = sub["mean_donor_distance_km"].mean()
        mean_resp = sub["top_k_response_rate"].mean() * 100

        ax.scatter(
            mean_dist,
            mean_resp,
            color=colors[strat],
            s=130,
            marker=markers[strat],
            label=labels[strat],
            zorder=5,
            edgecolor="#0f172a",
            linewidth=1.2,
        )

        offset_x = 0.04
        offset_y = 0.2 if strat == "hybrid_full" else -0.3
        ax.annotate(
            f"{labels[strat]}\n({mean_dist:.2f} km, {mean_resp:.1f}%)",
            (mean_dist, mean_resp),
            xytext=(mean_dist + offset_x, mean_resp + offset_y),
            fontsize=8.5,
            fontweight="semibold",
            color="#1e293b",
        )

    ax.set_title("Simulation results: Response Rate vs Contact Distance Trade-off", fontsize=12, fontweight="bold", pad=12)
    ax.set_xlabel("Mean Contacted Donor Distance (km) [Lower is closer]", fontsize=10)
    ax.set_ylabel("Top-K Batch Response Rate (%) [Higher is better]", fontsize=10)
    ax.legend(frameon=True, facecolor="#ffffff", framealpha=0.9, loc="lower right", fontsize=8.5)

    plt.tight_layout()
    output_file = OUTPUT_DIR / "figure1_tradeoff_curve.png"
    plt.savefig(output_file)
    plt.close()
    print(f"[Plot] Saved: {output_file}")


def plot_latency_comparison(metrics_df: pd.DataFrame) -> None:
    """Figure 2: Time to First Acceptance Distribution."""
    fig, ax = plt.subplots(figsize=(7, 4.5), dpi=300)

    strategies = ["baseline_proximity", "hybrid_full", "ablation_ml_only", "ablation_geo_only"]
    palette = ["#94a3b8", "#ef4444", "#3b82f6", "#10b981"]

    data = []
    labels = ["Baseline (Prox)", "Hybrid (Full)", "ML Only", "Geo Only"]

    for strat in strategies:
        sub = metrics_df[(metrics_df["strategy"] == strat) & (metrics_df["time_to_first_accept_sec"].notna())]
        data.append(sub["time_to_first_accept_sec"].to_numpy())

    box = ax.boxplot(
        data,
        tick_labels=labels,
        patch_artist=True,
        showmeans=True,
        meanline=True,
        medianprops={"color": "#0f172a", "linewidth": 1.5},
        meanprops={"color": "#ffffff", "linewidth": 1.5, "linestyle": "--"},
    )

    for patch, color in zip(box["boxes"], palette, strict=False):
        patch.set_facecolor(color)
        patch.set_alpha(0.85)

    ax.set_title("Simulation results: Time to First Acceptance Distribution", fontsize=12, fontweight="bold", pad=12)
    ax.set_ylabel("Time to First Acceptance (seconds)", fontsize=10)

    plt.tight_layout()
    output_file = OUTPUT_DIR / "figure2_latency_distribution.png"
    plt.savefig(output_file)
    plt.close()
    print(f"[Plot] Saved: {output_file}")


def plot_paired_differences() -> None:
    """Figure 3: Paired Performance Differences (Hybrid vs Baseline)."""
    paired_path = RESULTS_DIR / "paired_differences.csv"
    if not paired_path.exists():
        return

    paired_df = pd.read_csv(paired_path, comment="#")

    fig, ax = plt.subplots(figsize=(8.5, 4.5), dpi=300)

    metrics = paired_df["metric"].tolist()
    diffs = paired_df["mean_difference"].tolist()
    ci_lower = paired_df["ci95_lower"].tolist()
    ci_upper = paired_df["ci95_upper"].tolist()

    y_pos = np.arange(len(metrics))
    errors = [
        [abs(diff - low) for diff, low in zip(diffs, ci_lower, strict=False)],
        [abs(high - diff) for diff, high in zip(diffs, ci_upper, strict=False)],
    ]

    colors = ["#22c55e" if d > 0 and "Response" in m or d < 0 and "Time" in m or d < 0 and "Alerted" in m else "#ef4444" for m, d in zip(metrics, diffs, strict=False)]

    ax.barh(y_pos, diffs, xerr=errors, align="center", color=colors, alpha=0.85, capsize=4, edgecolor="#1e293b")
    ax.axvline(0, color="#64748b", linestyle="--", linewidth=1.0)
    ax.set_yticks(y_pos)
    ax.set_yticklabels(metrics, fontsize=9.5)
    ax.invert_yaxis()
    ax.set_xlabel("Mean Difference (Hybrid - Baseline) with 95% Bootstrap CI", fontsize=10)
    ax.set_title("Simulation results: Paired Performance Differences (Hybrid Full vs Baseline Proximity)", fontsize=11, fontweight="bold", pad=12)

    plt.tight_layout()
    output_file = OUTPUT_DIR / "figure3_paired_differences.png"
    plt.savefig(output_file)
    plt.close()
    print(f"[Plot] Saved: {output_file}")


def plot_sensitivity_sweeps() -> None:
    """Figure 4: Sensitivity Sweeps across parameters."""
    sweep_path = RESULTS_DIR / "sensitivity_sweep.csv"
    if not sweep_path.exists():
        return

    sweep_df = pd.read_csv(sweep_path, comment="#")
    params = sweep_df["parameter"].unique()

    fig, axes = plt.subplots(1, len(params), figsize=(4 * len(params), 3.8), dpi=300, sharey=True)
    if len(params) == 1:
        axes = [axes]

    for ax, param in zip(axes, params, strict=False):
        sub = sweep_df[sweep_df["parameter"] == param]
        labels = sub["value_label"].unique()

        baseline_vals = [sub[(sub["strategy"] == "baseline_proximity") & (sub["value_label"] == l)]["top_k_response_rate"].values[0] * 100 for l in labels]
        hybrid_vals = [sub[(sub["strategy"] == "hybrid_full") & (sub["value_label"] == l)]["top_k_response_rate"].values[0] * 100 for l in labels]

        x = np.arange(len(labels))
        width = 0.35

        ax.bar(x - width / 2, baseline_vals, width, label="Baseline", color="#94a3b8", alpha=0.85)
        ax.bar(x + width / 2, hybrid_vals, width, label="Hybrid", color="#ef4444", alpha=0.85)

        ax.set_title(f"Simulation results: {param.replace('_', ' ').title()}", fontsize=9.5, fontweight="bold")
        ax.set_xticks(x)
        ax.set_xticklabels(labels, rotation=20, ha="right", fontsize=8)
        if ax == axes[0]:
            ax.set_ylabel("Top-K Response Rate (%)", fontsize=9.5)
            ax.legend(fontsize=8, loc="lower right")

    plt.suptitle("Simulation results: Sensitivity Analysis of Top-K Response Rate", fontsize=12, fontweight="bold", y=1.02)
    plt.tight_layout()
    output_file = OUTPUT_DIR / "figure4_sensitivity_sweeps.png"
    plt.savefig(output_file)
    plt.close()
    print(f"[Plot] Saved: {output_file}")


def main() -> None:
    ensure_results_exist()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    metrics_df = pd.read_csv(RESULTS_DIR / "strategy_metrics.csv", comment="#")

    generate_tables()
    plot_tradeoff(metrics_df)
    plot_latency_comparison(metrics_df)
    plot_paired_differences()
    plot_sensitivity_sweeps()

    print("\n[SUCCESS] Academic benchmark report and figures generated successfully.")


if __name__ == "__main__":
    main()
