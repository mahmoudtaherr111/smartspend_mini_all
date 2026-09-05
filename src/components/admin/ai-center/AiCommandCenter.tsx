import React, { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiTelemetryTab } from "./tabs/AiTelemetryTab";
import { AiProviderManagerTab } from "./tabs/AiProviderManagerTab";
import { AiUserQuotaInspectorTab } from "./tabs/AiUserQuotaInspectorTab";
import { AiRuleSandboxTab } from "./tabs/AiRuleSandboxTab";
import { TrendingUp, Server, UserCheck, FlaskConical } from "lucide-react";

export function AiCommandCenter() {
  const [subTab, setSubTab] = useState("telemetry");

  return (
    <Tabs value={subTab} onValueChange={setSubTab} className="space-y-6">
      {/* Subtab Navigation */}
      <div className="bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800/80 shadow-md">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 bg-transparent p-0 gap-1 h-auto">
          <TabsTrigger
            value="telemetry"
            className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-all"
          >
            <TrendingUp className="w-4 h-4" />
            مرصد الاستهلاك والتكلفة
          </TabsTrigger>

          <TabsTrigger
            value="providers"
            className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-all"
          >
            <Server className="w-4 h-4" />
            المزودات والموديلات
          </TabsTrigger>

          <TabsTrigger
            value="quotas"
            className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-all"
          >
            <UserCheck className="w-4 h-4" />
            كوتة واستنزاف المستخدمين
          </TabsTrigger>

          <TabsTrigger
            value="sandbox"
            className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white py-2.5 text-xs font-bold rounded-xl flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-all"
          >
            <FlaskConical className="w-4 h-4" />
            مختبر محرك القواعد
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Subtab Contents */}
      <TabsContent value="telemetry" className="m-0 focus-visible:outline-none">
        <AiTelemetryTab />
      </TabsContent>
      <TabsContent value="providers" className="m-0 focus-visible:outline-none">
        <AiProviderManagerTab />
      </TabsContent>
      <TabsContent value="quotas" className="m-0 focus-visible:outline-none">
        <AiUserQuotaInspectorTab />
      </TabsContent>
      <TabsContent value="sandbox" className="m-0 focus-visible:outline-none">
        <AiRuleSandboxTab />
      </TabsContent>
    </Tabs>
  );
}

