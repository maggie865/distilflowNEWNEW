import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, FlaskConical, Pencil, Package } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

const EMPTY_INGREDIENT = { name: '', quantity: '', unit: 'g', notes: '' };
const EMPTY_PACKAGING = { name: '', quantity: 1, unit: 'units', type: 'bottle' };

const EMPTY_SPIRIT_FORM = {
  recipe_type: 'spirit',
  name: '', description: '', base_ethanol_volume: '', base_ethanol_abv: '',
  bottles_per_case: '',
  ingredients: [{ ...EMPTY_INGREDIENT }],
  packaging: [],
  notes: ''
};

const EMPTY_PACKAGING_FORM = {
  recipe_type: 'packaging',
  name: '', description: '',
  bottles_per_case: '',
  packaging: [{ ...EMPTY_PACKAGING }],
  ingredients: [],
  notes: ''
};

export default function Recipes() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_SPIRIT_FORM);
  const queryClient = useQueryClient();

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => db.Recipe.list('name', 50),
  });

  const { data: rawMaterials = [] } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => db.RawMaterial.list('name', 500),
  });

  // Unique material names from stock (excluding ethanol/water)
  const stockIngredients = [...new Map(
    rawMaterials
      .filter(m => m.type !== 'ethanol' && m.type !== 'water')
      .map(m => [m.name, m])
  ).values()].sort((a, b) => a.name.localeCompare(b.name));

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

  const setPackaging = (index, field, value) => {
    setForm(prev => {
      const packaging = [...prev.packaging];
      packaging[index] = { ...packaging[index], [field]: value };
      return { ...prev, packaging };
    });
  };
  const addPackaging = () => setForm(prev => ({ ...prev, packaging: [...(prev.packaging || []), { ...EMPTY_PACKAGING }] }));
  const removePackaging = (index) => setForm(prev => ({ ...prev, packaging: prev.packaging.filter((_, i) => i !== index) }));

  const openNewSpirit = () => { setEditing(null); setForm(EMPTY_SPIRIT_FORM); setOpen(true); };
  const openNewPackaging = () => { setEditing(null); setForm(EMPTY_PACKAGING_FORM); setOpen(true); };

  const openEdit = (recipe) => {
    setEditing(recipe);
    setForm({
      recipe_type: recipe.recipe_type || 'spirit',
      name: recipe.name || '',
      description: recipe.description || '',
      base_ethanol_volume: recipe.base_ethanol_volume || '',
      base_ethanol_abv: recipe.base_ethanol_abv || '',
      bottles_per_case: recipe.bottles_per_case || '',
      ingredients: recipe.ingredients?.length ? recipe.ingredients : (recipe.recipe_type === 'packaging' ? [] : [{ ...EMPTY_INGREDIENT }]),
      packaging: recipe.packaging || [],
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
        bottles_per_case: data.bottles_per_case ? parseInt(data.bottles_per_case) : undefined,
        ingredients: data.ingredients
          .filter(i => i.name.trim())
          .map(i => ({ ...i, quantity: parseFloat(i.quantity) || 0 })),
        packaging: (data.packaging || [])
          .filter(p => p.name.trim())
          .map(p => ({ ...p, quantity: parseFloat(p.quantity) || 0 })),
      };
      if (editing) {
        await db.Recipe.update(editing.id, payload);
      } else {
        await db.Recipe.create(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setOpen(false);
      toast.success(editing ? 'Recipe updated' : 'Recipe created');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.Recipe.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Recipe deleted');
    },
  });

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Recipes" subtitle="Define products and their botanical recipes">
        <Button variant="outline" onClick={openNewPackaging}><Package className="w-4 h-4 mr-2" />New Packaging Recipe</Button>
        <Button onClick={openNewSpirit}><FlaskConical className="w-4 h-4 mr-2" />New Spirit Recipe</Button>
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
                    <div className="flex items-center gap-2 mb-1">
                      <CardTitle className="font-display text-lg">{recipe.name}</CardTitle>
                      <Badge variant="secondary" className={recipe.recipe_type === 'packaging' ? 'bg-sky-100 text-sky-800 text-xs' : 'bg-amber-100 text-amber-800 text-xs'}>
                        {recipe.recipe_type === 'packaging' ? 'Packaging' : 'Spirit'}
                      </Badge>
                    </div>
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
                  {recipe.bottles_per_case && (
                    <div className="rounded-md bg-muted px-3 py-2 text-center">
                      <p className="text-xs text-muted-foreground">Btls/Case</p>
                      <p className="text-sm font-semibold">{recipe.bottles_per_case}</p>
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
                {recipe.packaging?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Packaging (per bottle)
                    </p>
                    <div className="space-y-1">
                      {recipe.packaging.map((p, i) => (
                        <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-border/50 last:border-0">
                          <span className="text-foreground">{p.name}</span>
                          <span className="text-muted-foreground font-medium">{p.quantity} {p.unit}</span>
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
            <DialogTitle className="font-display">
              {editing
                ? `Edit ${form.recipe_type === 'packaging' ? 'Packaging' : 'Spirit'} Recipe`
                : form.recipe_type === 'packaging' ? 'New Packaging Recipe' : 'New Spirit Recipe'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(form); }} className="space-y-4 mt-2">
            <div>
              <Label>Product Name</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder={form.recipe_type === 'packaging' ? 'e.g. Standard 700ml Config' : 'e.g. London Dry Gin'} required />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={e => set('description', e.target.value)} placeholder="Brief description" />
            </div>

            {form.recipe_type === 'spirit' && (
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
                  <div>
                    <Label>Bottles per Case</Label>
                    <Input type="number" value={form.bottles_per_case} onChange={e => set('bottles_per_case', e.target.value)} placeholder="e.g. 12" />
                  </div>
                </div>
              </div>
            )}

            {form.recipe_type === 'packaging' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Bottles per Case</Label>
                  <Input type="number" value={form.bottles_per_case} onChange={e => set('bottles_per_case', e.target.value)} placeholder="e.g. 12" />
                </div>
              </div>
            )}

            {form.recipe_type === 'spirit' && (
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
                    <Select
                      value={ing.name}
                      onValueChange={val => {
                        const match = stockIngredients.find(m => m.name === val);
                        setIngredient(i, 'name', val);
                        if (match?.unit) setIngredient(i, 'unit', match.unit);
                      }}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select from stock…" />
                      </SelectTrigger>
                      <SelectContent>
                        {stockIngredients.map(m => (
                          <SelectItem key={m.id} value={m.name}>
                            <span>{m.name}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({m.quantity} {m.unit} in stock)
                            </span>
                          </SelectItem>
                        ))}
                        {stockIngredients.length === 0 && (
                          <div className="px-2 py-3 text-xs text-muted-foreground text-center">No stock items found</div>
                        )}
                      </SelectContent>
                    </Select>
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
            )}

            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Packaging</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Items consumed per bottle produced</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addPackaging}>
                  <Plus className="w-3 h-3 mr-1" />Add
                </Button>
              </div>
              {(form.packaging || []).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">No packaging items added yet</p>
              )}
              {(form.packaging || []).map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_70px_80px_auto] gap-2 items-end">
                  <div>
                    {i === 0 && <Label className="text-xs">Item Name</Label>}
                    <Input value={p.name} onChange={e => setPackaging(i, 'name', e.target.value)} placeholder="e.g. 700ml Bottle" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Qty</Label>}
                    <Input type="number" step="0.01" value={p.quantity} onChange={e => setPackaging(i, 'quantity', e.target.value)} placeholder="1" />
                  </div>
                  <div>
                    {i === 0 && <Label className="text-xs">Type</Label>}
                    <Select value={p.type} onValueChange={val => setPackaging(i, 'type', val)}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottle">Bottle</SelectItem>
                        <SelectItem value="closure">Closure</SelectItem>
                        <SelectItem value="label">Label</SelectItem>
                        <SelectItem value="carton">Carton</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className={i === 0 ? 'mt-5' : ''}>
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => removePackaging(i)}>
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
