import React, { useState, useEffect } from 'react';

interface Ingrediente {
  nombre: string;
  porcentaje: number;
}

interface Receta {
  id: string;
  nombre: string;
  ingredientes: Ingrediente[];
  instrucciones: string;
  fermentacion: string;
  horneado: string;
  pesoTotal: number;
}

const PanaderiaApp: React.FC = () => {
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [vista, setVista] = useState<'lista' | 'crear'>('lista');
  const [recetaEditando, setRecetaEditando] = useState<Receta | null>(null);

  // Cargar recetas desde localStorage al iniciar
  useEffect(() => {
    const recetasGuardadas = localStorage.getItem('recetasPanaderia');
    if (recetasGuardadas) {
      setRecetas(JSON.parse(recetasGuardadas));
    } else {
      // Recetas de ejemplo
      const recetasEjemplo: Receta[] = [
        {
          id: '1',
          nombre: 'Pan de Masa Madre Básico',
          ingredientes: [
            { nombre: 'Harina de trigo', porcentaje: 100 },
            { nombre: 'Agua', porcentaje: 75 },
            { nombre: 'Masa madre', porcentaje: 20 },
            { nombre: 'Sal', porcentaje: 2 }
          ],
          instrucciones: '1. Mezclar ingredientes\n2. Reposo de 30 min\n3. Amasar 10 min\n4. Fermentación 4-6 horas\n5. Hornear a 230°C por 35 min',
          fermentacion: '4-6 horas a temperatura ambiente',
          horneado: '35 min a 230°C',
          pesoTotal: 1000
        },
        {
          id: '2',
          nombre: 'Pan Integral con Centeno',
          ingredientes: [
            { nombre: 'Harina integral', porcentaje: 70 },
            { nombre: 'Harina de centeno', porcentaje: 30 },
            { nombre: 'Agua', porcentaje: 78 },
            { nombre: 'Masa madre', porcentaje: 15 },
            { nombre: 'Sal', porcentaje: 2.2 }
          ],
          instrucciones: '1. Autólisis de 30 min\n2. Incorporar masa madre y sal\n3. Fermentación larga en frío\n4. Formar y hornear con vapor',
          fermentacion: '12-18 horas en refrigerador',
          horneado: '40 min a 220°C con vapor inicial',
          pesoTotal: 800
        }
      ];
      setRecetas(recetasEjemplo);
      localStorage.setItem('recetasPanaderia', JSON.stringify(recetasEjemplo));
    }
  }, []);

  // Guardar recetas en localStorage cuando cambien
  useEffect(() => {
    localStorage.setItem('recetasPanaderia', JSON.stringify(recetas));
  }, [recetas]);

  const eliminarReceta = (id: string) => {
    setRecetas(recetas.filter(receta => receta.id !== id));
  };

  const VistaListaRecetas = () => (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-3xl font-bold text-center mb-8 text-foreground">Recetas de Panadería</h1>
      
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        {recetas.map(receta => (
          <div key={receta.id} className="bg-card rounded-lg shadow-md p-6 border border-border">
            <h2 className="text-xl font-semibold mb-4 text-foreground">{receta.nombre}</h2>
            
            <div className="mb-4">
              <h3 className="font-medium text-foreground mb-2">Ingredientes y Porcentajes:</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted-foreground">Ingrediente</th>
                    <th className="text-right py-2 text-muted-foreground">%</th>
                    <th className="text-right py-2 text-muted-foreground">Gramos</th>
                  </tr>
                </thead>
                <tbody>
                  {receta.ingredientes.map((ing, index) => (
                    <tr key={index} className="border-b border-border">
                      <td className="py-2 text-foreground">{ing.nombre}</td>
                      <td className="text-right py-2 text-muted-foreground">{ing.porcentaje}%</td>
                      <td className="text-right py-2 text-foreground">
                        {(receta.pesoTotal * ing.porcentaje / 100).toFixed(1)}g
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-sm text-muted-foreground mt-2">Total: {receta.pesoTotal}g</p>
            </div>
            
            <div className="mb-4">
              <h3 className="font-medium text-foreground mb-1">Fermentación:</h3>
              <p className="text-muted-foreground">{receta.fermentacion}</p>
            </div>
            
            <div className="mb-4">
              <h3 className="font-medium text-foreground mb-1">Horneado:</h3>
              <p className="text-muted-foreground">{receta.horneado}</p>
            </div>
            
            <div className="flex justify-between items-center mt-4">
              <button 
                onClick={() => eliminarReceta(receta.id)}
                className="text-destructive hover:text-destructive/80 text-sm"
              >
                Eliminar
              </button>
              <div className="flex space-x-2">
                <button 
                  className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 text-sm"
                  onClick={() => {
                    setRecetaEditando(receta);
                    setVista('crear');
                  }}
                >
                  Editar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-8 text-center">
        <button 
          onClick={() => {
            setRecetaEditando(null);
            setVista('crear');
          }}
          className="bg-primary text-primary-foreground px-6 py-3 rounded-md hover:bg-primary/90"
        >
          Agregar Nueva Receta
        </button>
      </div>
    </div>
  );

  const VistaCrearReceta = () => {
    const [nombre, setNombre] = useState(recetaEditando?.nombre || '');
    const [ingredientes, setIngredientes] = useState<Ingrediente[]>(
      recetaEditando?.ingredientes || [{ nombre: '', porcentaje: 0 }]
    );
    const [instrucciones, setInstrucciones] = useState(recetaEditando?.instrucciones || '');
    const [fermentacion, setFermentacion] = useState(recetaEditando?.fermentacion || '');
    const [horneado, setHorneado] = useState(recetaEditando?.horneado || '');
    const [pesoTotal, setPesoTotal] = useState(recetaEditando?.pesoTotal || 1000);

    const agregarIngrediente = () => {
      setIngredientes([...ingredientes, { nombre: '', porcentaje: 0 }]);
    };

    const actualizarIngrediente = (index: number, campo: keyof Ingrediente, valor: string | number) => {
      const nuevosIngredientes = [...ingredientes];
      nuevosIngredientes[index] = { ...nuevosIngredientes[index], [campo]: valor };
      setIngredientes(nuevosIngredientes);
    };

    const eliminarIngrediente = (index: number) => {
      if (ingredientes.length > 1) {
        setIngredientes(ingredientes.filter((_, i) => i !== index));
      }
    };

    const guardarReceta = () => {
      if (!nombre || ingredientes.some(ing => !ing.nombre || ing.porcentaje <= 0)) {
        alert('Por favor completa todos los campos obligatorios');
        return;
      }

      const receta: Receta = {
        id: recetaEditando?.id || Date.now().toString(),
        nombre,
        ingredientes,
        instrucciones,
        fermentacion,
        horneado,
        pesoTotal
      };

      if (recetaEditando) {
        setRecetas(recetas.map(r => r.id === recetaEditando.id ? receta : r));
      } else {
        setRecetas([...recetas, receta]);
      }

      setVista('lista');
    };

    return (
      <div className="container mx-auto p-4 max-w-2xl">
        <h1 className="text-3xl font-bold text-center mb-6 text-foreground">
          {recetaEditando ? 'Editar Receta' : 'Nueva Receta'}
        </h1>

        <div className="bg-card rounded-lg shadow-md p-6 border border-border">
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 text-foreground">Nombre de la receta</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full p-2 border border-border rounded-md bg-background text-foreground"
              placeholder="Ej: Pan de Masa Madre"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 text-foreground">Peso total (gramos)</label>
            <input
              type="number"
              value={pesoTotal}
              onChange={(e) => setPesoTotal(Number(e.target.value))}
              className="w-full p-2 border border-border rounded-md bg-background text-foreground"
              placeholder="1000"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-foreground">Ingredientes</label>
            {ingredientes.map((ingrediente, index) => (
              <div key={index} className="flex space-x-2 mb-2">
                <input
                  type="text"
                  value={ingrediente.nombre}
                  onChange={(e) => actualizarIngrediente(index, 'nombre', e.target.value)}
                  className="flex-1 p-2 border border-border rounded-md bg-background text-foreground"
                  placeholder="Nombre del ingrediente"
                />
                <input
                  type="number"
                  step="0.1"
                  value={ingrediente.porcentaje}
                  onChange={(e) => actualizarIngrediente(index, 'porcentaje', Number(e.target.value))}
                  className="w-20 p-2 border border-border rounded-md bg-background text-foreground"
                  placeholder="%"
                />
                <button
                  onClick={() => eliminarIngrediente(index)}
                  className="px-3 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90"
                >
                  X
                </button>
              </div>
            ))}
            <button
              onClick={agregarIngrediente}
              className="mt-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 text-sm"
            >
              + Agregar ingrediente
            </button>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 text-foreground">Instrucciones de preparación</label>
            <textarea
              value={instrucciones}
              onChange={(e) => setInstrucciones(e.target.value)}
              rows={4}
              className="w-full p-2 border border-border rounded-md bg-background text-foreground"
              placeholder="Describe los pasos de preparación..."
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1 text-foreground">Tiempo de fermentación</label>
            <input
              type="text"
              value={fermentacion}
              onChange={(e) => setFermentacion(e.target.value)}
              className="w-full p-2 border border-border rounded-md bg-background text-foreground"
              placeholder="Ej: 4-6 horas a temperatura ambiente"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium mb-1 text-foreground">Tiempo y temperatura de horneado</label>
            <input
              type="text"
              value={horneado}
              onChange={(e) => setHorneado(e.target.value)}
              className="w-full p-2 border border-border rounded-md bg-background text-foreground"
              placeholder="Ej: 35 min a 230°C"
            />
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setVista('lista')}
              className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80"
            >
              Cancelar
            </button>
            <button
              onClick={guardarReceta}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              {recetaEditando ? 'Actualizar' : 'Guardar'} Receta
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {vista === 'lista' ? <VistaListaRecetas /> : <VistaCrearReceta />}
    </div>
  );
};

export default PanaderiaApp;
