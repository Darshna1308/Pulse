/** Chart colors, validated for CVD separation and 3:1 contrast on white (dataviz validator). */
export const CHART = {
  requests: '#0A9FB3',
  anomalies: '#6343E8',
  errors: '#C2410C',
  grid: '#EEF1F6',
  axis: '#98A2B3',
  status: { '2xx': '#12804A', '3xx': '#667085', '4xx': '#A86A00', '5xx': '#C81E45' } as Record<string, string>,
};
