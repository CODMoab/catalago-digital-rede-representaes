import { useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import pagesData from "@/data/catalog-pages.json";

type CatalogKey = keyof typeof pagesData;

const CATALOGS: { key: CatalogKey; label: string; short: string }[] = [
  { key: "pele", label: "Cuidado com a Pele", short: "Skincare" },
  { key: "maquiagem", label: "Maquiagem", short: "Makeup" },
  { key: "essencial", label: "Apresentação Essencial", short: "Essencial" },
];

export function CatalogGallery() {
  const [tab, setTab] = useState<CatalogKey>("pele");
  const [zoom, setZoom] = useState<{ pages: string[]; index: number } | null>(
    null,
  );

  return (
    <div className="mb-8 rounded-2xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="size-5 text-primary" />
          <div>
            <h2 className="text-base font-bold">Catálogos visuais Payot</h2>
            <p className="text-xs text-muted-foreground">
              Folheie os catálogos oficiais e veja as fotos dos produtos.
            </p>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as CatalogKey)}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {CATALOGS.map((c) => (
            <TabsTrigger key={c.key} value={c.key}>
              {c.label}
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {pagesData[c.key].length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        {CATALOGS.map((c) => {
          const pages = pagesData[c.key];
          return (
            <TabsContent key={c.key} value={c.key} className="mt-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {pages.map((url, i) => (
                  <button
                    key={url}
                    onClick={() => setZoom({ pages, index: i })}
                    className="group relative overflow-hidden rounded-md border border-border bg-muted transition-all hover:border-primary hover:shadow-md"
                  >
                    <img
                      src={url}
                      alt={`${c.label} — página ${i + 1}`}
                      loading="lazy"
                      className="aspect-[3/4] w-full object-cover transition-transform group-hover:scale-105"
                    />
                    <span className="absolute bottom-1 right-1 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-semibold">
                      {i + 1}
                    </span>
                  </button>
                ))}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-w-5xl gap-2 p-2 sm:p-4">
          <DialogTitle className="sr-only">Página do catálogo</DialogTitle>
          {zoom && (
            <>
              <div className="relative flex items-center justify-center bg-muted">
                <img
                  src={zoom.pages[zoom.index]}
                  alt={`Página ${zoom.index + 1}`}
                  className="max-h-[80vh] w-auto object-contain"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={zoom.index === 0}
                  onClick={() =>
                    setZoom((z) => z && { ...z, index: z.index - 1 })
                  }
                >
                  <ChevronLeft className="mr-1 size-4" /> Anterior
                </Button>
                <span className="text-xs font-medium text-muted-foreground">
                  Página {zoom.index + 1} de {zoom.pages.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={zoom.index === zoom.pages.length - 1}
                  onClick={() =>
                    setZoom((z) => z && { ...z, index: z.index + 1 })
                  }
                >
                  Próxima <ChevronRight className="ml-1 size-4" />
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CatalogGalleryTrigger() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <BookOpen className="size-4" />
          Ver catálogos com fotos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl">
        <DialogTitle>Catálogos visuais Payot</DialogTitle>
        <CatalogGallery />
      </DialogContent>
    </Dialog>
  );
}
