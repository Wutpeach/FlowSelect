import { useState } from "react";
import { Folder, Video, Image, Music, FileBox } from "lucide-react";

const categories = [
  { id: "all", label: "All", icon: Folder },
  { id: "video", label: "Video", icon: Video },
  { id: "image", label: "Image", icon: Image },
  { id: "audio", label: "Audio", icon: Music },
  { id: "project", label: "Project Files", icon: FileBox },
];

export default function Sidebar() {
  const [selected, setSelected] = useState("all");

  return (
    <aside className="w-64 bg-[#1e1e1e] border-r border-[#3a3a3a] flex flex-col py-4">
      <nav className="flex flex-col gap-1 px-2">
        {categories.map((cat) => {
          const Icon = cat.icon;
          const isActive = selected === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelected(cat.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-[#3a3a3a] text-white"
                  : "text-[#a0a0a0] hover:bg-[#2a2a2a] hover:text-white"
              }`}
            >
              <Icon size={18} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
