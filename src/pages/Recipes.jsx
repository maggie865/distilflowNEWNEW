import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, FlaskConical, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

const EMPTY_INGREDIENT = { name: '', quantity: '', unit: 'g', notes: '' };

const EMPTY_FORM = {
  name: '', description: '', base_ethanol_volume: '', base_ethanol_abv: '',
  ingredients: [{ ...EMPTY_INGREDIENT }], notes: ''
};

export default function Recipes() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const queryClient = useQueryClient();

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.list('name', 50),
  });

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const setIngredient = (index, field, value) => {
    setForm(prev => {
      const ingredients = [...prev.ingredients];
      ingredients[index] = { ...ingredients[index], [field]: value };
      return { ...prev, ingredients };
    });
  };

  const addIngredient = () => setForm(prev => ({ ...prev, ingredients: [...prev.ingredients, { ...EMPTY_INGREDIENT }] }));
  const removeIngredient = (index) => setForm(prev => ({ ...prev, ingredients: prev.ingredients.filter((_, i) => i !== index) }));

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setOpen(true); };

  const openEdit = (recipe) => {
    setEditing(recipe);
    setForm({
      name: recipe.name || '',
      description: recipe.description || '',
      base_ethanol_volume: recipe.base_ethanol_volume || '',
      base_ethanol_abv: recipe.base_ethanol_abv || '',
      ingredients: recipe.ingredients?.length ? recipe.ingredients : [{ ...EMPTY_INGREDIENT }],
      notes: recipe.notes || '',
    });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const payload = {
        ...data,
        base_ethanol_volume: parseFloat(data.base_ethanol_volume) || 0,
        base_ethanol_abv: data.base_ethanol_abv ? parseFloat(data.base_ethanol_abv) : undefined,
        ingredients: data.ingredients
          .filter(i => i.name.trim())
          .map(i => ({ ...i, quantity: parseFloat(i.quantity) || 0 })),
      };
      if (editing) {
        await base44.entities.Recipe.update(editing.id, payload);
      } else {
        await base44.entities.Recipe.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setOpen(false);
      toast.success(editing ? 'Recipe updated' : 'Recipe created');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Recipe.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Recipe deleted');
    },
  });

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Recipes" subtitle="Define products and their botanical recipes">
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />New Recipe</Button>
      </PageHeader>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : recipes.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No recipes yet</p>
          <p className="text-sm mt-1">Create your first product recipe to get started</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {recipes.map(recipe => (
            <Card key={recipe.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="font-display text-lg">{recipe.name}</CardTitle>
                    {recipe.description && <p className="text-sm text-muted-foreground mt-1">{recipe.description}</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(recipe)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(recipe.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 flex-wrap">
                  <div className="rounded-md bg-muted px-3 py-2 text-center">
                    <p className="text-xs text-muted-foreground">Base Vol</p>
                    <p className="text-sm font-semibold">{recipe.base_ethanol_volume}L</p>
                  </div>
                  {recipe.base_ethanol_abv && (
                    <div className="rounded-md bg-muted px-3 py-2 text-center">
                      <p className="text-xs text-muted-foreground">Ethanol ABV</p>
                      <p className="text-sm font-semibold">{recipe.base_ethanol_abv}%</p>
                    </div>
                  )}
                </div>
                {recipe.ingredients?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Botanicals (per {recipe.base_ethanol_volume}L)
                    </p>
                    <div className="space-y-1">
                      {recipe.ingredients.map((ing, i) => (
                        <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                          <span className="text-foreground">{ing.name}</span>
                          <span className="text-muted-foreground font-medium">{ing.quantity} {ing.unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? 'Edit Recipe' : 'New Recipe'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-4 mt-2">
            <div>
              <Label>Product Name</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. London Dry Gin" required />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description" />
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Base Recipe Parameters</p>
              <p className="text-xs text-muted-foreground">All ingredient quantities are relative to this ethanol volume and will auto-scale for different batch sizes.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Base Ethanol Volume (L)</Label>
                  <Input type="number" step="0.01" value={form.base_ethanol_volume} onChange={e => set('base_ethanol_volume', e.target.value)} placeholder="e.g. 100" required />
                </div>
                <div>
                  <Label>Ethanol ABV %</Label>
                  <Input type="number" step="0.1" value={form.base_ethanol_abv} onChange={e => set('base_ethanol_abv', e.target.value)} placeholder="e.g. 96" />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Botanicals / Ingredients</p>
                <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
                  <Plus className="w-3 h-3 mr-1" />Add
                </Button>
              </div>
              {form.ingredients.map((ing, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_60px_auto] gap-2 items-end">
                  <div>
                    {i === 0 && <Label className="text-xs">Ingredient</Label>}
                    <Input value={ing.name} onChange={e => setIngredient(i, 'name', e.target.value)} placeholder="e.g. Juniper" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Qty</Label>}
                    <Input type="number" step="0.01" value={ing.quantity} onChange={e => setIngredient(i, 'quantity', e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Unit</Label>}
                    <Input value={ing.unit} onChange={e => setIngredient(i, 'unit', e.target.value)} placeholder="g" />
                  </div>
                  <div className={i === 0 ? 'mt-5' : ''}>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => removeIngredient(i)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Process notes, tips, etc." />
            </div>

            <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : editing ? 'Update Recipe' : 'Create Recipe'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}