# Multi-Series Chart Implementation Guide

## Problem Overview

The current frontend Chart component draws **one single line** for all data points, completely ignoring the `seriesField` parameter sent by the backend.

### Current Behavior (Broken)
When backend sends a chart spec for comparing Target vs Achievement:

```json
{
  "type": "line",
  "title": "Target vs Achievement NPS Mobile Nasional Q1-Q4",
  "xField": "time_value",
  "yField": "value_num",
  "seriesField": "metric",
  "data": [
    {"time_value": "Q1", "value_num": 50, "metric": "Target 2025"},
    {"time_value": "Q1", "value_num": 52, "metric": "ACH 2025"},
    {"time_value": "Q2", "value_num": 51, "metric": "Target 2025"},
    {"time_value": "Q2", "value_num": 51, "metric": "ACH 2025"},
    {"time_value": "Q3", "value_num": 53, "metric": "Target 2025"},
    {"time_value": "Q3", "value_num": 49.97, "metric": "ACH 2025"},
    {"time_value": "Q4", "value_num": 54, "metric": "Target 2025"},
    {"time_value": "Q4", "value_num": 51, "metric": "ACH 2025"}
  ]
}
```

**Expected:** 2 separate lines (blue for Target, green for Achievement)
**Actual:** 1 single line connecting all 8 points in wrong order

---

## Solution Architecture

### Step 1: Detect Multi-Series Mode

Check if the chart spec includes a `seriesField` parameter:

```typescript
const seriesField = chart.seriesField;
const hasMultipleSeries = seriesField && chart.data.length > 0;
```

### Step 2: Group Data by Series

Group all data points by their series identifier (e.g., "metric" value):

```typescript
const groupedData: Record<string, typeof chart.data> = {};

if (hasMultipleSeries) {
  chart.data.forEach(item => {
    const key = String(item[seriesField]);
    if (!groupedData[key]) {
      groupedData[key] = [];
    }
    groupedData[key].push(item);
  });
} else {
  // Single series mode
  groupedData['default'] = chart.data;
}
```

**Result:**
```javascript
{
  "Target 2025": [
    {"time_value": "Q1", "value_num": 50, "metric": "Target 2025"},
    {"time_value": "Q2", "value_num": 51, "metric": "Target 2025"},
    {"time_value": "Q3", "value_num": 53, "metric": "Target 2025"},
    {"time_value": "Q4", "value_num": 54, "metric": "Target 2025"}
  ],
  "ACH 2025": [
    {"time_value": "Q1", "value_num": 52, "metric": "ACH 2025"},
    {"time_value": "Q2", "value_num": 51, "metric": "ACH 2025"},
    {"time_value": "Q3", "value_num": 49.97, "metric": "ACH 2025"},
    {"time_value": "Q4", "value_num": 51, "metric": "ACH 2025"}
  ]
}
```

### Step 3: Extract Unique X-Axis Values

Get all unique X values (time periods) to position points correctly:

```typescript
const xField = chart.xField || 'label';
const uniqueXValues = Array.from(
  new Set(chart.data.map(item => String(item[xField])))
).sort();
```

**Result:** `['Q1', 'Q2', 'Q3', 'Q4']`

### Step 4: Draw Multi-Series Lines

Loop through each series and draw separate lines with different colors:

```typescript
if (chart.type === 'line' && hasMultipleSeries) {
  const seriesNames = Object.keys(groupedData);
  const colors = chart.colorScheme || ['#5B8FF9', '#5AD8A6', '#F6BD16'];

  seriesNames.forEach((seriesName, seriesIndex) => {
    const seriesData = groupedData[seriesName];
    const color = colors[seriesIndex % colors.length];

    // Sort points by X value to ensure correct order
    const points = seriesData
      .sort((a, b) => {
        const aIndex = uniqueXValues.indexOf(String(a[xField]));
        const bIndex = uniqueXValues.indexOf(String(b[xField]));
        return aIndex - bIndex;
      })
      .map(item => {
        const xIndex = uniqueXValues.indexOf(String(item[xField]));
        const x = padding + (xIndex / (uniqueXValues.length - 1 || 1)) * chartWidth;
        const value = Number(item[yField]) || 0;
        const y = canvas.height - padding - (value / maxValue) * chartHeight;
        return { x, y, value };
      });

    // Draw line for this series
    ctx.strokeStyle = color;
    ctx.lineWidth = chart.lineWidth || 2;
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();

    // Draw points for this series
    ctx.fillStyle = color;
    const pointSize = chart.pointSize || 4;
    points.forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, pointSize, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}
```

### Step 5: Add Legend

Draw a legend showing which color represents which series:

```typescript
// Draw legend at the bottom
const seriesNames = Object.keys(groupedData);
const colors = chart.colorScheme || ['#5B8FF9', '#5AD8A6', '#F6BD16'];

let legendX = padding;
const legendY = canvas.height - padding + 40;

seriesNames.forEach((seriesName, index) => {
  const color = colors[index % colors.length];

  // Draw color box
  ctx.fillStyle = color;
  ctx.fillRect(legendX, legendY, 12, 12);

  // Draw series name
  ctx.fillStyle = '#1a1a2e';
  ctx.font = '11px Poppins, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(seriesName, legendX + 16, legendY + 10);

  legendX += ctx.measureText(seriesName).width + 40;
});
```

---

## Complete Implementation

Replace the existing line chart section in `Chart` component with this multi-series version:

```typescript
function Chart({ chart }: { chart: ChartData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!chart || !chart.data || chart.data.length === 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padding = 60;
    const chartWidth = canvas.width - padding * 2;
    const chartHeight = canvas.height - padding * 2;

    // Get chart configuration
    const colors = chart.colorScheme || ['#5B8FF9', '#5AD8A6', '#F6BD16', '#E86452', '#6DC8EC'];
    const yField = chart.yField || 'value';
    const xField = chart.xField || 'label';
    const seriesField = chart.seriesField;
    const hasMultipleSeries = seriesField && chart.data.length > 0;

    // ========== GROUP DATA BY SERIES ==========
    const groupedData: Record<string, typeof chart.data> = {};

    if (hasMultipleSeries) {
      chart.data.forEach(item => {
        const key = String(item[seriesField]);
        if (!groupedData[key]) {
          groupedData[key] = [];
        }
        groupedData[key].push(item);
      });
    } else {
      groupedData['default'] = chart.data;
    }

    // ========== GET UNIQUE X VALUES ==========
    const uniqueXValues = Array.from(
      new Set(chart.data.map(item => String(item[xField])))
    ).sort();

    // ========== CALCULATE MAX VALUE ==========
    const maxValue = Math.max(
      ...chart.data.map(d => Number(d[yField]) || 0)
    ) * 1.1;

    // ========== DRAW TITLE ==========
    ctx.fillStyle = '#1a1a2e';
    ctx.font = 'bold 16px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(chart.title, canvas.width / 2, 25);

    // ========== DRAW AXES ==========
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding); // Y axis
    ctx.lineTo(canvas.width - padding, canvas.height - padding); // X axis
    ctx.stroke();

    // ========== DRAW CHART ==========
    if (chart.type === 'line') {
      if (hasMultipleSeries) {
        // ========== MULTI-SERIES LINE CHART ==========
        const seriesNames = Object.keys(groupedData);

        seriesNames.forEach((seriesName, seriesIndex) => {
          const seriesData = groupedData[seriesName];
          const color = colors[seriesIndex % colors.length];

          // Sort and create points for this series
          const points = seriesData
            .sort((a, b) => {
              const aIndex = uniqueXValues.indexOf(String(a[xField]));
              const bIndex = uniqueXValues.indexOf(String(b[xField]));
              return aIndex - bIndex;
            })
            .map(item => {
              const xIndex = uniqueXValues.indexOf(String(item[xField]));
              const x = padding + (xIndex / (uniqueXValues.length - 1 || 1)) * chartWidth;
              const value = Number(item[yField]) || 0;
              const y = canvas.height - padding - (value / maxValue) * chartHeight;
              return { x, y, value, label: item[xField] };
            });

          // Draw line
          ctx.strokeStyle = color;
          ctx.lineWidth = chart.lineWidth || 2;
          ctx.beginPath();

          const smooth = chart.smooth === true;
          if (smooth && points.length > 1) {
            // Smooth curve (bezier)
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 0; i < points.length - 1; i++) {
              const p0 = points[Math.max(0, i - 1)];
              const p1 = points[i];
              const p2 = points[i + 1];
              const p3 = points[Math.min(points.length - 1, i + 2)];

              const cp1x = p1.x + (p2.x - p0.x) / 6;
              const cp1y = p1.y + (p2.y - p0.y) / 6;
              const cp2x = p2.x - (p3.x - p1.x) / 6;
              const cp2y = p2.y - (p3.y - p1.y) / 6;

              ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
            }
          } else {
            // Straight lines
            points.forEach((point, index) => {
              if (index === 0) ctx.moveTo(point.x, point.y);
              else ctx.lineTo(point.x, point.y);
            });
          }
          ctx.stroke();

          // Draw points
          ctx.fillStyle = color;
          const pointSize = chart.pointSize || 4;
          points.forEach(point => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, pointSize, 0, Math.PI * 2);
            ctx.fill();

            // Draw value label
            ctx.fillStyle = '#1a1a2e';
            ctx.font = '10px Poppins, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(point.value.toFixed(1), point.x, point.y - pointSize - 3);
            ctx.fillStyle = color; // Reset for next point
          });
        });

        // ========== DRAW X-AXIS LABELS ==========
        uniqueXValues.forEach((xValue, index) => {
          const x = padding + (index / (uniqueXValues.length - 1 || 1)) * chartWidth;
          ctx.save();
          ctx.translate(x, canvas.height - padding + 15);
          ctx.rotate(-Math.PI / 4);
          ctx.textAlign = 'right';
          ctx.fillStyle = '#6b7280';
          ctx.font = '10px Poppins, sans-serif';
          ctx.fillText(String(xValue), 0, 0);
          ctx.restore();
        });

        // ========== DRAW LEGEND ==========
        const legendY = canvas.height - padding + 40;
        let legendX = padding;

        seriesNames.forEach((seriesName, index) => {
          const color = colors[index % colors.length];

          // Color box
          ctx.fillStyle = color;
          ctx.fillRect(legendX, legendY, 12, 12);

          // Series name
          ctx.fillStyle = '#1a1a2e';
          ctx.font = '11px Poppins, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(seriesName, legendX + 16, legendY + 10);

          legendX += ctx.measureText(seriesName).width + 40;
        });

      } else {
        // ========== SINGLE SERIES LINE CHART (EXISTING CODE) ==========
        const gap = chartWidth / (chart.data.length - 1 || 1);
        const points = chart.data.map((item, index) => {
          const value = Number(item[yField]) || 0;
          return {
            x: padding + gap * index,
            y: canvas.height - padding - (value / maxValue) * chartHeight,
            value
          };
        });

        ctx.strokeStyle = colors[0];
        ctx.lineWidth = chart.lineWidth || 3;
        ctx.beginPath();
        points.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.stroke();

        ctx.fillStyle = colors[0];
        const pointSize = chart.pointSize || 5;
        points.forEach(point => {
          ctx.beginPath();
          ctx.arc(point.x, point.y, pointSize, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    } else if (chart.type === 'bar') {
      // ========== BAR CHART (EXISTING CODE) ==========
      // Keep your existing bar chart implementation
      const barWidth = chartWidth / chart.data.length * 0.6;
      const gap = chartWidth / chart.data.length;

      chart.data.forEach((item, index) => {
        const value = Number(item[yField]) || 0;
        const barHeight = (value / maxValue) * chartHeight;
        const x = padding + gap * index + (gap - barWidth) / 2;
        const y = canvas.height - padding - barHeight;

        ctx.fillStyle = colors[index % colors.length];
        ctx.fillRect(x, y, barWidth, barHeight);

        ctx.fillStyle = '#1a1a2e';
        ctx.font = '11px Poppins, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(value.toString(), x + barWidth / 2, y - 5);

        ctx.save();
        ctx.translate(x + barWidth / 2, canvas.height - padding + 15);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#6b7280';
        ctx.font = '10px Poppins, sans-serif';
        const label = String(item[xField] || index);
        ctx.fillText(label.length > 10 ? label.substring(0, 10) + '...' : label, 0, 0);
        ctx.restore();
      });

    } else if (chart.type === 'pie') {
      // ========== PIE CHART (EXISTING CODE) ==========
      // Keep your existing pie chart implementation
      const total = chart.data.reduce((sum, item) => {
        return sum + (Number(item[yField]) || 0);
      }, 0);

      let currentAngle = -Math.PI / 2;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2 + 10;
      const radius = Math.min(chartWidth, chartHeight) / 2.5;

      chart.data.forEach((item, index) => {
        const value = Number(item[yField]) || 0;
        const sliceAngle = (value / total) * Math.PI * 2;

        ctx.fillStyle = colors[index % colors.length];
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
        ctx.closePath();
        ctx.fill();

        const labelAngle = currentAngle + sliceAngle / 2;
        const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
        const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);

        const percentage = ((value / total) * 100).toFixed(1);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Poppins, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${percentage}%`, labelX, labelY);

        currentAngle += sliceAngle;
      });

      // Legend for pie chart
      const legendX = padding;
      let legendY = padding;

      chart.data.forEach((item, index) => {
        const label = String(item[xField] || index);

        ctx.fillStyle = colors[index % colors.length];
        ctx.fillRect(legendX, legendY, 15, 15);

        ctx.fillStyle = '#1a1a2e';
        ctx.font = '11px Poppins, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, legendX + 20, legendY + 12);

        legendY += 22;
      });
    }

    // ========== DRAW Y-AXIS LABELS ==========
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px Poppins, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) {
      const value = (maxValue / 5) * i;
      const y = canvas.height - padding - (value / maxValue) * chartHeight;
      ctx.fillText(Math.round(value).toString(), padding - 10, y + 3);
    }

  }, [chart]);

  return (
    <div style={{
      marginTop: 12,
      borderRadius: 12,
      overflow: 'hidden',
      background: '#fff',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
    }}>
      <canvas
        ref={canvasRef}
        width={600}
        height={350}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      />
    </div>
  );
}
```

---

## Testing Checklist

After implementing, verify:

- [ ] **Two separate lines** appear for Target vs Achievement queries
- [ ] **Different colors** for each line (blue, green, etc.)
- [ ] **Legend** shows which color represents which metric
- [ ] **X-axis labels** are correct (Q1, Q2, Q3, Q4)
- [ ] **All data points** are plotted (4 points per series = 8 total)
- [ ] **Values display** above each point
- [ ] **Single series mode** still works (when no `seriesField`)
- [ ] **Bar and pie charts** still work (unchanged)

---

## Example Queries to Test

1. **"Buat grafik Target vs Achievement NPS Mobile Nasional dari Q1 sampai Q4"**
   - Expected: 2 lines (Target 2025, ACH 2025)
   - X-axis: Q1, Q2, Q3, Q4

2. **"Berikan saya grafik Reduce Customer Complain Mobile area Jabar dan Jakarta"**
   - Expected: 2 lines (Jabar, Jakarta)

3. **"Grafik trend NPS Mobile Q1-Q4"**
   - Expected: 1 line (single series, no comparison)

---

## Troubleshooting

### Lines are crossed/chaotic
**Cause:** Data points not sorted by X value
**Fix:** Sort points by `uniqueXValues.indexOf(item[xField])` before drawing

### All points have same color
**Cause:** Not using different colors per series
**Fix:** Use `colors[seriesIndex % colors.length]` when drawing

### Legend overlaps title
**Cause:** Legend position calculation wrong
**Fix:** Adjust `legendY` to be below X-axis labels

### Missing X-axis labels
**Cause:** Labels drawn before series lines
**Fix:** Draw labels after all series lines are complete

---

## Files to Modify

**Frontend:** `D:\belajar\chatbot-gmi-fe\app\chat\page.tsx`

**Function:** `Chart({ chart }: { chart: ChartData })`

**Lines to update:** ~140-320 (the line chart section)

---

## Backend Compatibility

This frontend change is **fully compatible** with existing backend:

- ✅ Single series charts (no `seriesField`) → Works as before
- ✅ Multi-series charts (with `seriesField`) → New feature enabled
- ✅ Bar charts → Unchanged
- ✅ Pie charts → Unchanged

No backend changes required!
