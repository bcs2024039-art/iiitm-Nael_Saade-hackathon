import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    Plotly?: any;
  }
}

interface PlotlyChartProps {
  data: any[];
  layout?: any;
  config?: any;
  style?: React.CSSProperties;
  className?: string;
}

export const PlotlyChart: React.FC<PlotlyChartProps> = ({
  data,
  layout,
  config = { displaylogo: false, responsive: true },
  style = { width: '100%', height: '100%' },
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    const renderChart = () => {
      if (!containerRef.current || !active) return;
      if (window.Plotly) {
        const mergedLayout = {
          font: { family: "'IBM Plex Sans', 'Segoe UI', sans-serif", color: '#4A5E66', size: 12 },
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          margin: { l: 40, r: 20, t: 40, b: 40 },
          ...layout,
        };
        window.Plotly.react(containerRef.current, data, mergedLayout, config);
      } else {
        // Retry shortly if Plotly CDN is still downloading
        setTimeout(renderChart, 100);
      }
    };

    renderChart();

    const handleResize = () => {
      if (containerRef.current && window.Plotly) {
        window.Plotly.Plots.resize(containerRef.current);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      active = false;
      window.removeEventListener('resize', handleResize);
    };
  }, [data, layout, config]);

  return <div ref={containerRef} style={style} className={className} />;
};
