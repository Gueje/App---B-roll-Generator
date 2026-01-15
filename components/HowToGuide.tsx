import React from 'react';
import { Upload, Sparkles, Search, Palette, Wand2, Video, Image as ImageIcon, MousePointerClick } from 'lucide-react';

const HowToGuide: React.FC = () => {
  return (
    <div className="mt-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
      <div className="bg-indigo-600 dark:bg-indigo-700 px-6 py-4">
        <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          ¿Cómo usar esta App? Guía Completa
        </h2>
      </div>

      <div className="p-6 md:p-8 space-y-10 text-slate-800 dark:text-slate-200">
        
        {/* Step 1: The Process */}
        <section>
          <h3 className="text-slate-900 dark:text-white font-bold text-lg mb-4 border-b pb-2 border-slate-100 dark:border-slate-700">
            1. El Proceso Mágico
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 flex items-center justify-center font-bold">1</div>
              <h4 className="font-semibold text-slate-800 dark:text-white">Sube tu Guion (.docx)</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                La aplicación toma tu archivo Word y separa el texto en bloques lógicos. También detecta automáticamente cualquier nota que hayas dejado entre corchetes `[Nota]` o llaves {`{Nota}`}.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 flex items-center justify-center font-bold">2</div>
              <h4 className="font-semibold text-slate-800 dark:text-white">Análisis con IA</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Al hacer clic en "Generar Visuales", la Inteligencia Artificial lee tu historia completa para entender el contexto, las emociones y los personajes antes de sugerir nada.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 flex items-center justify-center font-bold">3</div>
              <h4 className="font-semibold text-slate-800 dark:text-white">Plan Visual (B-Roll)</h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Obtienes una lista visual escena por escena. Ya no tienes que imaginar qué poner mientras alguien habla; la app te dice exactamente qué buscar o grabar.
              </p>
            </div>
          </div>
        </section>

        {/* Step 2: Understanding the Cards */}
        <section>
          <h3 className="text-slate-900 dark:text-white font-bold text-lg mb-6 border-b pb-2 border-slate-100 dark:border-slate-700">
            2. Entendiendo los Resultados
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-8">
            
            {/* Media Type */}
            <div className="flex gap-4">
              <div className="shrink-0 mt-1">
                <div className="flex gap-1">
                   <span className="p-1.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded"><Video className="w-4 h-4" /></span>
                   <span className="p-1.5 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded"><ImageIcon className="w-4 h-4" /></span>
                </div>
              </div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-white">¿Video o Imagen?</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  La IA decide si es mejor un <strong>VIDEO</strong> (para acciones, movimiento, transiciones) o una <strong>IMAGEN</strong> (para mostrar datos estáticos, objetos específicos o pausas dramáticas).
                </p>
              </div>
            </div>

            {/* Visual Intent */}
            <div className="flex gap-4">
              <div className="shrink-0 mt-1 p-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg">
                <Search className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-white">Intención Visual y Búsqueda</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  No solo te dice "un perro", sino "un Golden Retriever corriendo en cámara lenta hacia la cámara". Además, generamos términos de búsqueda ("Keywords") optimizados para encontrar ese clip exacto.
                </p>
              </div>
            </div>

            {/* Style & Mood */}
            <div className="flex gap-4">
              <div className="shrink-0 mt-1 p-2 bg-pink-100 dark:bg-pink-900 text-pink-600 dark:text-pink-300 rounded-lg">
                <Palette className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-white">Estilo y Mood (Atmósfera)</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Para que tu video no parezca un collage desordenado, la IA define un estilo visual global (ej. "Cinemático", "Corporativo", "Cyberpunk"). Esto asegura que todas las sugerencias parezcan pertenecer a la misma película.
                </p>
              </div>
            </div>

            {/* Stock Buttons */}
            <div className="flex gap-4">
              <div className="shrink-0 mt-1 p-2 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 rounded-lg">
                <MousePointerClick className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-white">Botones de Stock (Pexels, Unsplash...)</h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Estos botones son atajos inteligentes. Al hacer clic, abren directamente una búsqueda en esos sitios web usando los términos precisos que generó la IA. Te ahorran escribir manualmante en cada sitio.
                </p>
              </div>
            </div>

             {/* AI Prompt */}
             <div className="flex gap-4 md:col-span-2 bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900">
              <div className="shrink-0 mt-1 p-2 bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200 rounded-lg">
                <Wand2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-indigo-900 dark:text-indigo-200">¿Qué es el "AI Prompt"?</h4>
                <p className="text-sm text-indigo-800 dark:text-indigo-300 mt-1">
                  A veces, la imagen perfecta no existe en los bancos de stock. Este campo te da un texto técnico listo para copiar y pegar en herramientas generativas como <strong>Midjourney, DALL-E o Adobe Firefly</strong>. Está diseñado con instrucciones de cámara e iluminación para crear la imagen sintética perfecta.
                </p>
              </div>
            </div>

          </div>
        </section>

      </div>
    </div>
  );
};

export default HowToGuide;