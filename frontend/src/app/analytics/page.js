"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredData, api } from "@/lib/api";
import { 
  BarChart as BarChartIcon, 
  Calendar, 
  Download,
  TrendingUp,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AnalyticsPage() {
  const router = useRouter();
  const [authData, setAuthData] = useState(null);
  const [funnelData, setFunnelData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const data = getStoredData();
    if (!data) {
      router.push("/login");
      return;
    }
    setAuthData(data);
    
    const fetchFunnel = async () => {
      try {
        const fetchedFunnel = await api.getFunnel(data.bot_id, data.tenant_id);
        setFunnelData(fetchedFunnel);
      } catch (err) {
        console.error("Failed to fetch funnel data:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchFunnel();
  }, [router]);

  // Find max count for relative width scaling
  const maxCount = funnelData.length > 0 ? funnelData[0].count : 1;

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-black min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
              <BarChartIcon className="w-8 h-8 text-emerald-500" />
              Conversion Analytics
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
              Track the customer journey from visitor to converted lead
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline" className="bg-white dark:bg-zinc-900">
              <Calendar className="w-4 h-4 mr-2" />
              Last 30 Days
            </Button>
            <Button variant="outline" className="bg-white dark:bg-zinc-900">
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>

        {/* Funnel Visualization */}
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm p-6 lg:p-10">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              Sales Funnel
            </h2>
          </div>

          <div className="space-y-4">
            {loading ? (
              <div className="py-20 text-center text-zinc-500">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-emerald-500 border-r-transparent"></div>
                <p className="mt-4 font-medium">Analyzing conversion data...</p>
              </div>
            ) : funnelData.length === 0 ? (
              <div className="py-20 text-center text-zinc-500">
                <BarChartIcon className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-4" />
                <p className="font-medium text-zinc-900 dark:text-zinc-300">No data available</p>
                <p className="text-sm mt-1">Start chatting with visitors to generate analytics.</p>
              </div>
            ) : (
              funnelData.map((stage, index) => {
                const widthPercent = (stage.count / maxCount) * 100;
                // Add color gradient logic for funnel
                const opacities = [
                  "bg-emerald-500/20",
                  "bg-emerald-500/30",
                  "bg-emerald-500/40",
                  "bg-emerald-500/50",
                  "bg-emerald-500/70",
                  "bg-emerald-500/90",
                  "bg-emerald-500",
                ];
                const bgColor = opacities[Math.min(index, opacities.length - 1)];

                return (
                  <div key={stage.name} className="relative group">
                    {/* Connection Line */}
                    {index > 0 && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-zinc-300 dark:text-zinc-700">
                        <ArrowRight className="w-4 h-4 rotate-90" />
                      </div>
                    )}
                    
                    <div className="flex items-center gap-4">
                      {/* Left side label */}
                      <div className="w-1/4 md:w-1/5 text-right shrink-0">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{stage.name}</p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">{stage.change}</p>
                      </div>

                      {/* Bar Visualization */}
                      <div className="flex-1 h-12 md:h-16 bg-zinc-100 dark:bg-zinc-900/50 rounded-xl overflow-hidden relative flex items-center justify-center">
                        <div 
                          className={`absolute left-1/2 -translate-x-1/2 h-full rounded-xl transition-all duration-1000 ${bgColor}`}
                          style={{ width: `${Math.max(widthPercent, 2)}%` }} // Minimum 2% width so it's visible
                        >
                          <div className="absolute inset-0 border border-emerald-500/20 rounded-xl"></div>
                        </div>
                        
                        {/* Values Overlay */}
                        <div className="relative z-10 flex items-center justify-center w-full px-4 gap-4">
                          <span className="text-sm md:text-base font-bold text-zinc-900 dark:text-zinc-50 drop-shadow-sm">
                            {stage.count.toLocaleString()}
                          </span>
                          <span className="text-xs md:text-sm font-semibold text-zinc-600 dark:text-zinc-300 bg-white/50 dark:bg-black/50 px-2 py-0.5 rounded-full backdrop-blur-sm">
                            {stage.percentage}%
                          </span>
                        </div>
                      </div>
                      
                      {/* Right side spacer to keep center aligned */}
                      <div className="w-1/4 md:w-1/5 shrink-0 hidden sm:block"></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
