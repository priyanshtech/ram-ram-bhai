"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, getStoredData } from "@/lib/api";
import { Upload, Globe, CheckCircle2, AlertCircle, FileText, RefreshCw, UploadCloud, File, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default function KnowledgeBasePage() {
  const router = useRouter();
  const [authData, setAuthData] = useState(null);
  
  const [file, setFile] = useState(null);
  
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState({ type: "", message: "" });
  
  const [documents, setDocuments] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const fetchDocuments = async (bot_id, tenant_id) => {
    try {
      const docs = await api.getKnowledgeSources(bot_id, tenant_id);
      setDocuments(docs);
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    }
  };

  useEffect(() => {
    const data = getStoredData();
    if (!data.tenant_id || !data.bot_id) {
      router.push("/login");
      return;
    }
    setAuthData(data);
    fetchDocuments(data.bot_id, data.tenant_id);
  }, [router]);

  // Polling for processing status
  useEffect(() => {
    if (!authData) return;
    const hasProcessingDocs = documents.some(doc => doc.status === "queued" || doc.status === "processing");
    
    let intervalId;
    if (hasProcessingDocs) {
      intervalId = setInterval(() => {
        fetchDocuments(authData.bot_id, authData.tenant_id);
      }, 3000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [documents, authData]);

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!file || !authData) return;
    
    setUploadLoading(true);
    setUploadStatus({ type: "", message: "" });
    
    try {
      await api.uploadKnowledge(authData.bot_id, authData.tenant_id, file);
      setUploadStatus({ type: "success", message: "Document uploaded successfully. Processing in background." });
      setFile(null);
      
      const fileInput = document.getElementById("file-upload");
      if (fileInput) fileInput.value = "";
      
      fetchDocuments(authData.bot_id, authData.tenant_id);
      setTimeout(() => setUploadStatus({ type: "", message: "" }), 5000);
    } catch (err) {
      setUploadStatus({ type: "error", message: err.message });
    } finally {
      setUploadLoading(false);
    }
  };

  const handleDelete = async (sourceId) => {
    if (!confirm("Are you sure you want to delete this document?")) return;
    try {
      await api.deleteKnowledgeSource(authData.bot_id, sourceId, authData.tenant_id);
      fetchDocuments(authData.bot_id, authData.tenant_id);
    } catch (err) {
      console.error("Failed to delete document:", err);
      alert("Failed to delete document: " + err.message);
    }
  };

  if (!authData) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">Knowledge Base</h1>
          <p className="text-zinc-500 text-sm mt-1 dark:text-zinc-400">
            Upload and manage the documents that power your AI's responses.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 min-w-0 items-start">
        
        {/* Upload Section */}
        <div className="lg:col-span-1 space-y-6 min-w-0">
          <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm bg-zinc-50/50 dark:bg-zinc-900/20 w-full overflow-hidden">
            <CardHeader className="p-8 pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-zinc-400" />
                Upload Data
              </CardTitle>
              <CardDescription>
                Provide PDFs, DOCX, or TXT files.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 pt-0">
              <form onSubmit={handleFileUpload} className="space-y-6">
                <div 
                  className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-colors duration-200 ${
                    isDragging 
                      ? "border-zinc-900 bg-zinc-100 dark:border-zinc-100 dark:bg-zinc-800" 
                      : file 
                        ? "border-emerald-500 bg-emerald-50/50 dark:border-emerald-500/50 dark:bg-emerald-950/20" 
                        : "border-zinc-200 hover:border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-600"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      setFile(e.dataTransfer.files[0]);
                    }
                  }}
                >
                  <div className="flex flex-col items-center justify-center space-y-3">
                    {file ? (
                      <div className="flex flex-col items-center gap-2">
                        <File className="w-8 h-8 text-emerald-500" />
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[200px]">{file.name}</span>
                        <span className="text-xs text-zinc-500">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                      </div>
                    ) : (
                      <>
                        <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                          <UploadCloud className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            Drag & drop or click to browse
                          </p>
                          <p className="text-xs text-zinc-500">Supports PDF, DOCX, TXT</p>
                        </div>
                      </>
                    )}
                  </div>
                  <input 
                    id="file-upload" 
                    type="file" 
                    accept=".pdf,.docx,.txt"
                    onChange={(e) => setFile(e.target.files[0])}
                    disabled={uploadLoading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                </div>

                {uploadStatus.message && (
                  <div className={`flex items-start gap-2 p-3 rounded-lg text-sm border ${
                    uploadStatus.type === "success" 
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-400" 
                      : "bg-red-50 border-red-200 text-red-600 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-400"
                  }`}>
                    {uploadStatus.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                    <span className="leading-tight">{uploadStatus.message}</span>
                  </div>
                )}
                
                <Button 
                  type="submit" 
                  disabled={!file || uploadLoading}
                  className="w-full gap-2 bg-zinc-900 text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {uploadLoading ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Uploading...</>
                  ) : (
                    <><Upload className="w-4 h-4" /> Index Document</>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Documents Table */}
        <div className="lg:col-span-2 min-w-0">
          <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden flex flex-col h-full">
            <CardHeader className="p-8 pb-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/20">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Indexed Documents</CardTitle>
                  <CardDescription className="mt-1">
                    {documents.length} {documents.length === 1 ? 'document' : 'documents'} actively supplying context.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-x-auto">
              {documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[300px] text-zinc-500 space-y-3">
                  <FileText className="w-8 h-8 opacity-20" />
                  <p className="text-sm">No documents uploaded yet.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      <th className="py-4 px-8 w-1/2">Document Name</th>
                      <th className="py-4 px-8">Status</th>
                      <th className="py-4 px-8 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 text-sm bg-white dark:bg-zinc-950">
                    {documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition group">
                        <td className="py-4 px-8">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                              <FileText className="w-4 h-4 text-zinc-500" />
                            </div>
                            <span className="font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-[250px] sm:max-w-[300px]" title={doc.title}>
                              {doc.title}
                            </span>
                          </div>
                        </td>
                        <td className="py-5 px-8">
                          {doc.status === "ready" && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/50">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                            </span>
                          )}
                          {(doc.status === "queued" || doc.status === "processing") && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> {doc.status}
                            </span>
                          )}
                          {doc.status === "failed" && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50">
                              <AlertCircle className="w-3.5 h-3.5" /> Failed
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-8 text-right">
                          <Button  
                            size="icon" 
                            onClick={() => handleDelete(doc.id)}
                            className="text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 opacity-60 group-hover:opacity-100 transition-opacity"
                            title="Delete Document"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
