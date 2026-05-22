import { useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import { compressImageFile } from "@/lib/compress-image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Camera, Loader2, ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface ReceiptCaptureProps {
  onSaved?: () => void;
}

export function ReceiptCapture({ onSaved }: ReceiptCaptureProps) {
  const planQuery = trpc.pro.myPlan.useQuery();
  const parseMutation = trpc.image.parseReceipt.useMutation({
    onSuccess: (data) => {
      toast.success(`تم حفظ ${data.amount} ج.م — ${data.category}`);
      onSaved?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const isPro =
    planQuery.data?.plan === "pro" ||
    planQuery.data?.plan === "ultra" ||
    planQuery.data?.role === "admin";

  if (!isPro) {
    return (
      <Card className="border-dashed opacity-90">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Camera className="w-4 h-4" />
            صورة / إيصال (Pro)
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          التقط صورة للفاتورة أو سكرين شوت البنك — متاح في باقة Pro مع تصنيف تلقائي.
        </CardContent>
      </Card>
    );
  }

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPreview(result);
      const base64 = result.includes(",") ? result.split(",")[1]! : result;
      parseMutation.mutate({
        imageBase64: base64,
        mimeType: file.type || "image/jpeg",
        saveExpense: true,
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Camera className="w-4 h-4 text-violet-600" />
          صورة إيصال / سكرين شوت
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2 flex-1 min-h-[48px] active-press"
            onClick={() => inputRef.current?.click()}
            disabled={parseMutation.isPending}
          >
            {parseMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
            كاميرا / معرض
          </Button>
        </div>
        {preview && (
          <div className="relative rounded-lg overflow-hidden border max-h-40">
            <img src={preview} alt="معاينة" className="w-full object-cover max-h-40" />
            <ImageIcon className="absolute top-2 left-2 w-4 h-4 text-white drop-shadow" />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          يعمل مع فواتير، سكرين شوتات البنك، وإنستاباي. يُفضّل OCR على الجهاز ثم الإرسال لتوفير التوكنز.
        </p>
      </CardContent>
    </Card>
  );
}
