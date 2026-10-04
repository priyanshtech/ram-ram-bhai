"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredData, api } from "@/lib/api";
import { 
  Users, 
  Search, 
  Filter, 
  Download,
  Mail,
  Phone,
  MapPin,
  Building2,
  Calendar,
  Box,
  BadgeAlert
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LeadsPage() {
  const router = useRouter();
  const [authData, setAuthData] = useState(null);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const data = getStoredData();
    if (!data) {
      router.push("/login");
      return;
    }
    setAuthData(data);
    
    const fetchLeads = async () => {
      try {
        const fetchedLeads = await api.getLeads(data.bot_id, data.tenant_id);
        setLeads(fetchedLeads);
      } catch (err) {
        console.error("Failed to fetch leads:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchLeads();
  }, [router]);

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'new': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800';
      case 'contacted': return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800';
      case 'qualified': return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800';
      case 'quotation sent': return 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800';
      case 'won': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800';
      case 'lost': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
      default: return 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700';
    }
  };

  const filteredLeads = leads.filter(lead => 
    lead.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    lead.requirement?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-50 dark:bg-black min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-3">
              <Users className="w-8 h-8 text-emerald-500" />
              Lead Management
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
              View and manage leads captured by your AI Assistant
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button variant="outline" className="bg-white dark:bg-zinc-900">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20">
              Create Lead
            </Button>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mb-6 shadow-sm flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input 
              placeholder="Search leads by name, email, company..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 h-10"
            />
          </div>
          <Button variant="outline" className="bg-white dark:bg-zinc-900 shrink-0 h-10">
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </Button>
        </div>

        {/* Leads Table */}
        <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 dark:text-zinc-400 text-xs uppercase font-semibold tracking-wider">
                <tr>
                  <th className="px-6 py-4 rounded-tl-xl">Contact</th>
                  <th className="px-6 py-4">Requirement</th>
                  <th className="px-6 py-4">Details</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 rounded-tr-xl">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-zinc-500">
                      <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-emerald-500 border-r-transparent"></div>
                      <p className="mt-2">Loading leads...</p>
                    </td>
                  </tr>
                ) : filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-zinc-500">
                      <Users className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                      <p className="font-medium text-zinc-900 dark:text-zinc-300">No leads found</p>
                      <p className="text-xs mt-1">Wait for visitors to chat with your AI assistant.</p>
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                      <td className="px-6 py-4 align-top">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100 mb-1">
                          {lead.name || "Unknown Visitor"}
                        </div>
                        {lead.company && (
                          <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-1">
                            <Building2 className="w-3.5 h-3.5" />
                            {lead.company}
                          </div>
                        )}
                        {lead.email && (
                          <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-1">
                            <Mail className="w-3.5 h-3.5" />
                            {lead.email}
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                            <Phone className="w-3.5 h-3.5" />
                            {lead.phone}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 align-top max-w-[250px]">
                        <div className="text-zinc-800 dark:text-zinc-200 line-clamp-3 leading-relaxed">
                          {lead.requirement || lead.query || "No specific requirement captured."}
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <div className="space-y-2">
                          {lead.interested_product && (
                            <div className="flex items-start gap-2 text-xs">
                              <Box className="w-3.5 h-3.5 text-zinc-400 mt-0.5" />
                              <span className="text-zinc-600 dark:text-zinc-400">{lead.interested_product}</span>
                            </div>
                          )}
                          {lead.location && (
                            <div className="flex items-start gap-2 text-xs">
                              <MapPin className="w-3.5 h-3.5 text-zinc-400 mt-0.5" />
                              <span className="text-zinc-600 dark:text-zinc-400">{lead.location}</span>
                            </div>
                          )}
                          {lead.estimated_quantity && (
                            <div className="flex items-start gap-2 text-xs">
                              <BadgeAlert className="w-3.5 h-3.5 text-zinc-400 mt-0.5" />
                              <span className="text-zinc-600 dark:text-zinc-400">{lead.estimated_quantity} qty</span>
                            </div>
                          )}
                          {lead.purchase_timeline && (
                            <div className="flex items-start gap-2 text-xs">
                              <Calendar className="w-3.5 h-3.5 text-zinc-400 mt-0.5" />
                              <span className="text-zinc-600 dark:text-zinc-400">{lead.purchase_timeline}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 align-top">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(lead.status || 'New')}`}>
                          {lead.status || 'New'}
                        </span>
                      </td>
                      <td className="px-6 py-4 align-top text-xs text-zinc-500 whitespace-nowrap">
                        {new Date(lead.created_at).toLocaleDateString(undefined, { 
                          month: 'short', 
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
