import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useState } from "react";
import { BlockItem } from "./BlockItem";
import type { Block } from "@/lib/newsletter-renderer";

interface BlockCanvasProps {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (blocks: Block[]) => void;
  onAddBlock: () => void;
}

export function BlockCanvas({
  blocks,
  selectedId,
  onSelect,
  onDelete,
  onReorder,
  onAddBlock,
}: BlockCanvasProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(active.id as string);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    onReorder(arrayMove(blocks, oldIndex, newIndex));
  }

  const activeBlock = blocks.find((b) => b.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {blocks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground border-2 border-dashed border-border rounded-2xl">
              <p className="text-sm font-medium">Canvas vazio</p>
              <p className="text-xs">Clique nos blocos à esquerda para adicionar</p>
            </div>
          )}

          {blocks.map((block) => (
            <BlockItem
              key={block.id}
              block={block}
              isSelected={selectedId === block.id}
              onSelect={() => onSelect(block.id)}
              onDelete={() => onDelete(block.id)}
            />
          ))}

          <button
            type="button"
            onClick={onAddBlock}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Adicionar bloco
          </button>
        </div>
      </SortableContext>

      <DragOverlay>
        {activeBlock && (
          <div className="opacity-90 rotate-1 shadow-2xl rounded-xl">
            <BlockItem
              block={activeBlock}
              isSelected={false}
              onSelect={() => {}}
              onDelete={() => {}}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
