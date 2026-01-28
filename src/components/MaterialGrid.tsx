interface MaterialGridProps {
  files: string[];
}

export default function MaterialGrid({ files }: MaterialGridProps) {
  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
        {files.map((fileName, index) => (
          <div
            key={index}
            className="bg-[#1e1e1e] rounded-lg border border-[#3a3a3a] overflow-hidden hover:border-[#5a5a5a] transition-colors cursor-pointer"
          >
            <div className="aspect-video bg-[#252525] flex items-center justify-center text-[#4a4a4a]">
              <span className="text-3xl">▶</span>
            </div>
            <div className="p-3">
              <p className="text-sm text-[#d0d0d0] truncate">{fileName}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
