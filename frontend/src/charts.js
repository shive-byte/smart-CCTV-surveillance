import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  DoughnutController,
  ArcElement,
  BarController,
  BarElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

// Register Chart.js components
Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  DoughnutController,
  ArcElement,
  BarController,
  BarElement,
  Tooltip,
  Legend,
  Filler
);

// Global Chart.js defaults for Light Theme
Chart.defaults.font.family = "'Plus Jakarta Sans', -apple-system, sans-serif";
Chart.defaults.color = "#64748b";

let healthTrendChartInstance = null;
let cameraStatusChartInstance = null;

export function renderHealthTrendChart(canvasElement, trendData) {
  if (!canvasElement) return null;

  if (healthTrendChartInstance) {
    healthTrendChartInstance.destroy();
  }

  const ctx = canvasElement.getContext("2d");

  // Create subtle gradient fill for health score line
  const gradient = ctx.createLinearGradient(0, 0, 0, 240);
  gradient.addColorStop(0, "rgba(37, 99, 235, 0.22)");
  gradient.addColorStop(1, "rgba(37, 99, 235, 0.0)");

  // Normalize data or create placeholder points if DB is fresh
  const days = [];
  const healthScores = [];
  const eventCounts = [];

  if (trendData && trendData.length > 0) {
    trendData.forEach((item) => {
      const d = new Date(item.day);
      const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      days.push(label);
      healthScores.push(item.avg_health ?? 100);
      eventCounts.push(item.event_count ?? 0);
    });
  } else {
    // Generate recent 7 days fallback baseline
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
      healthScores.push(98 - Math.floor(Math.random() * 5));
      eventCounts.push(Math.floor(Math.random() * 3));
    }
  }

  healthTrendChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: days,
      datasets: [
        {
          label: "Fleet Health Score (%)",
          data: healthScores,
          borderColor: "#2563eb",
          borderWidth: 2.5,
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: "#2563eb",
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          yAxisID: "y",
        },
        {
          label: "Events Detected",
          data: eventCounts,
          borderColor: "#f59e0b",
          borderWidth: 2,
          backgroundColor: "rgba(245, 158, 11, 0.1)",
          borderDash: [4, 4],
          tension: 0.3,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: "#f59e0b",
          pointBorderWidth: 2,
          pointRadius: 3,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "end",
          labels: {
            boxWidth: 10,
            usePointStyle: true,
            pointStyle: "circle",
            font: { size: 12, weight: "500" },
            color: "#475569",
          },
        },
        tooltip: {
          backgroundColor: "#ffffff",
          titleColor: "#0f172a",
          bodyColor: "#334155",
          borderColor: "#e2e8f0",
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          usePointStyle: true,
          boxWidth: 8,
          shadowOffsetX: 0,
          shadowOffsetY: 4,
          shadowBlur: 12,
          shadowColor: "rgba(0,0,0,0.06)",
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: "#94a3b8",
            font: { size: 11 },
          },
        },
        y: {
          type: "linear",
          display: true,
          position: "left",
          min: 0,
          max: 100,
          grid: {
            color: "#f1f5f9",
          },
          ticks: {
            color: "#94a3b8",
            font: { size: 11 },
            callback: (val) => `${val}%`,
          },
        },
        y1: {
          type: "linear",
          display: true,
          position: "right",
          min: 0,
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            color: "#f59e0b",
            font: { size: 11 },
            stepSize: 1,
          },
        },
      },
    },
  });

  return healthTrendChartInstance;
}

export function renderCameraStatusChart(canvasElement, cameraCounts) {
  if (!canvasElement) return null;

  if (cameraStatusChartInstance) {
    cameraStatusChartInstance.destroy();
  }

  const ctx = canvasElement.getContext("2d");

  const online = cameraCounts?.online ?? 0;
  const offline = cameraCounts?.offline ?? 0;
  const error = cameraCounts?.error ?? 0;
  const total = cameraCounts?.total ?? (online + offline + error);

  const dataValues = total === 0 ? [1, 0, 0] : [online, offline, error];
  const colors = total === 0 ? ["#e2e8f0", "#f1f5f9", "#cbd5e1"] : ["#10b981", "#f59e0b", "#ef4444"];

  cameraStatusChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: total === 0 ? ["No Cameras"] : ["Online", "Offline", "Error / Dead"],
      datasets: [
        {
          data: dataValues,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: "#ffffff",
          hoverOffset: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "74%",
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            boxWidth: 8,
            usePointStyle: true,
            font: { size: 11, weight: "500" },
            color: "#475569",
            padding: 12,
          },
        },
        tooltip: {
          backgroundColor: "#ffffff",
          titleColor: "#0f172a",
          bodyColor: "#334155",
          borderColor: "#e2e8f0",
          borderWidth: 1,
          padding: 8,
        },
      },
    },
  });

  return cameraStatusChartInstance;
}
