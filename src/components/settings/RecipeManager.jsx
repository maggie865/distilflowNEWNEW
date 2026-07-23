import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Pencil, X, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';

const EMPTY_INGREDIENT = { name: '', quantity: '', unit: 'g', notes: '' };
const EMPTY_PACKAGING = { name: '', quantity: 1, unit: 'units', type: 'bottle' };

// Fetch packaging items from RawMaterial stock for dropdown selection
function usePackagingStock() {
  const { data: rawMaterials = [] } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => base44.entities.RawMaterial.list('name', 5000),
  });
  return rawMaterials.filter(m => m.type === 'packaging' || m.type === 'Packaging');
}
const EMPTY_SPIRIT_FORM = {
  recipe_type: 'spirit',
  name: '', description: '', base_ethanol_volume: '', base_ethanol_abv: '',
  bottles_per_case: '',
  ingredients: [{ ...EMPTY_INGREDIENT }],
  packaging: [],
  notes: ''
};

function PackagingSelect({ value, onChange }) {
  const packagingStock = usePackagingStock();
  const [custom, setCustom] = useState(false);

  // If current value isn't in stock, show custom input
  const inStock = packagingStock.some(m => m.name === value);

  if (custom || (value && !inStock)) {
    return (
      <div className="flex gap-1">
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Type packaging name"
          className="flex-1"
        />
        {packagingStock.length > 0 && (
          <button type="button" onClick={() => setCustom(false)} className="text-xs text-primary underline whitespace-nowrap">
            Pick from stock
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 border border-border rounded-md px-2 py-1 text-sm bg-background"
      >
        <option value="">— Select packaging item —</option>
        {packagingStock.map(m => (
          <option key={m.id} value={m.name}>
            {m.name} ({m.quantity || 0} {m.unit || 'units'} in stock)
          </option>
        ))}
      </select>
      <button type="button" onClick={() => setCustom(true)} className="text-xs text-muted-foreground underline whitespace-nowrap">
        Custom
      </button>
    </div>
  );
}

export default function RecipeManager() {
  const queryClient = useQueryClient();
  const [recipeForm, setRecipeForm] = useState(EMPTY_SPIRIT_FORM);
  const [editingId, setEditingId] = useState(null);

  const { data: recipes = [], isLoading: loadingRecipes } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => base44.entities.Recipe.list('name', 50),
  });

  const { data: rawMaterials = [] } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => base44.entities.RawMaterial.list('name', 500),
  });

  const stockIngredients = [...new Map(
    rawMaterials
      .filter(m => m.type !== 'ethanol' && m.type !== 'water')
      .map(m => [m.name, m])
  ).values()].sort((a, b) => a.name.localeCompare(b.name));

  const buildPayload = (data) => ({
    ...data,
    base_ethanol_volume: parseFloat(data.base_ethanol_volume) || 0,
    base_ethanol_abv: data.base_ethanol_abv ? parseFloat(data.base_ethanol_abv) : undefined,
    bottles_per_case: data.bottles_per_case ? parseInt(data.bottles_per_case) : undefined,
    ingredients: data.ingredients
      .filter(i => i.name && i.name.trim())
      .map(i => ({ ...i, quantity: parseFloat(i.quantity) || 0 })),
    packaging: (data.packaging || [])
      .filter(p => p.name && p.name.trim())
      .map(p => ({ ...p, quantity: parseFloat(p.quantity) || 0 })),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Recipe.create(buildPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setRecipeForm(EMPTY_SPIRIT_FORM);
      toast.success('Recipe created');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Recipe.update(id, buildPayload(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      setRecipeForm(EMPTY_SPIRIT_FORM);
      setEditingId(null);
      toast.success('Recipe updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Recipe.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Recipe deleted');
    },
  });

  const handleAddIngredient = () => {
    setRecipeForm(prev => ({ ...prev, ingredients: [...prev.ingredients, { ...EMPTY_INGREDIENT }] }));
  };
  const handleRemoveIngredient = (index) => {
    setRecipeForm(prev => ({ ...prev, ingredients: prev.ingredients.filter((_, i) => i !== index) }));
  };
  const handleSetIngredient = (index, field, value) => {
    setRecipeForm(prev => {
      const ingredients = [...prev.ingredients];
      ingredients[index] = { ...ingredients[index], [field]: value };
      return { ...prev, ingredients };
    });
  };

  const handleAddPackaging = () => {
    setRecipeForm(prev => ({ ...prev, packaging: [...(prev.packaging || []), { ...EMPTY_PACKAGING }] }));
  };
  const handleRemovePackaging = (index) => {
    setRecipeForm(prev => ({ ...prev, packaging: prev.packaging.filter((_, i) => i !== index) }));
  };
  const handleSetPackaging = (index, field, value) => {
    setRecipeForm(prev => {
      const packaging = [...prev.packaging];
      packaging[index] = { ...packaging[index], [field]: value };
      return { ...prev, packaging };
    });
  };

  const handleEdit = (recipe) => {
    setEditingId(recipe.id);
    setRecipeForm({
      recipe_type: recipe.recipe_type || 'spirit',
      name: recipe.name || '',
      description: recipe.description || '',
      base_ethanol_volume: recipe.base_ethanol_volume?.toString() || '',
      base_ethanol_abv: recipe.base_ethanol_abv?.toString() || '',
      bottles_per_case: recipe.bottles_per_case?.toString() || '',
      ingredients: (recipe.ingredients?.length ? recipe.ingredients : [{ ...EMPTY_INGREDIENT }]).map(i => ({
        name: i.name || '', quantity: i.quantity?.toString() || '', unit: i.unit || 'g', notes: i.notes || ''
      })),
      packaging: recipe.packaging?.length ? recipe.packaging.map(p => ({
        name: p.name || '', quantity: p.quantity?.toString() || '', unit: p.unit || 'units', type: p.type || 'bottle'
      })) : [],
      notes: recipe.notes || '',
    });
    // Scroll to form
    document.getElementById('recipe-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleCancelEdit = () => {
    setRecipeForm(EMPTY_SPIRIT_FORM);
    setEditingId(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!recipeForm.name) { toast.error('Recipe name is required'); return; }
    if (recipeForm.recipe_type === 'spirit' && !recipeForm.base_ethanol_volume) {
      toast.error('Base ethanol volume is required for spirit recipes'); return;
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: recipeForm });
    } else {
      createMutation.mutate(recipeForm);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Card id="recipe-form-card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FlaskConical className="w-5 h-5" />
              {editingId ? 'Edit Recipe' : 'Create New Recipe'}
            </span>
            {editingId && (
              <Button variant="ghost" size="sm" onClick={handleCancelEdit} className="gap-1">
                <X className="w-4 h-4" /> Cancel
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Product Name</Label>
                <Input
                  value={recipeForm.name}
                  onChange={(e) => setRecipeForm({ ...recipeForm, name: e.target.value })}
                  placeholder="e.g. London Dry Gin"
                  required
                />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Input
                  value={recipeForm.description}
                  onChange={(e) => setRecipeForm({ ...recipeForm, description: e.target.value })}
                  placeholder="Brief description"
                />
              </div>
              <div>
                <Label>Base Ethanol Volume (L)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={recipeForm.base_ethanol_volume}
                  onChange={(e) => setRecipeForm({ ...recipeForm, base_ethanol_volume: e.target.value })}
                  placeholder="100"
                  required
                />
              </div>
              <div>
                <Label>Ethanol ABV %</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={recipeForm.base_ethanol_abv}
                  onChange={(e) => setRecipeForm({ ...recipeForm, base_ethanol_abv: e.target.value })}
                  placeholder="96"
                />
              </div>
              <div>
                <Label>Bottles per Case</Label>
                <Input
                  type="number"
                  value={recipeForm.bottles_per_case}
                  onChange={(e) => setRecipeForm({ ...recipeForm, bottles_per_case: e.target.value })}
                  placeholder="12"
                />
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Botanicals</p>
                <Button type="button" variant="outline" size="sm" onClick={handleAddIngredient}>
                  <Plus className="w-3 h-3 mr-1" />Add
                </Button>
              </div>
              {recipeForm.ingredients.map((ing, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_60px_auto] gap-2 items-end">
                  <Select
                    value={ing.name}
                    onValueChange={(val) => {
                      const match = stockIngredients.find(m => m.name === val);
                      handleSetIngredient(i, 'name', val);
                      if (match?.unit) handleSetIngredient(i, 'unit', match.unit);
                    }}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select ingredient…" />
                    </SelectTrigger>
                    <SelectContent>
                      {stockIngredients.map(m => (
                        <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.01"
                    value={ing.quantity}
                    onChange={(e) => handleSetIngredient(i, 'quantity', e.target.value)}
                    placeholder="0"
                  />
                  <Input
                    value={ing.unit}
                    onChange={(e) => handleSetIngredient(i, 'unit', e.target.value)}
                    placeholder="g"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    onClick={() => handleRemoveIngredient(i)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Packaging (per bottle)</p>
                <Button type="button" variant="outline" size="sm" onClick={handleAddPackaging}>
                  <Plus className="w-3 h-3 mr-1" />Add
                </Button>
              </div>
              {(recipeForm.packaging || []).map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_70px_80px_auto] gap-2 items-end">
                  <PackagingSelect
                    value={p.name}
                    onChange={(val) => handleSetPackaging(i, 'name', val)}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={p.quantity}
                    onChange={(e) => handleSetPackaging(i, 'quantity', e.target.value)}
                    placeholder="1"
                  />
                  <Select value={p.type} onValueChange={(val) => handleSetPackaging(i, 'type', val)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bottle">Bottle</SelectItem>
                      <SelectItem value="closure">Closure</SelectItem>
                      <SelectItem value="label">Label</SelectItem>
                      <SelectItem value="carton">Carton</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    onClick={() => handleRemovePackaging(i)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={recipeForm.notes}
                onChange={(e) => setRecipeForm({ ...recipeForm, notes: e.target.value })}
                placeholder="Process notes, tips, etc."
              />
            </div>

            <div className="flex gap-3">
              <Button type="submit" className="flex-1" disabled={isPending}>
                {isPending ? 'Saving...' : editingId ? 'Update Recipe' : 'Create Recipe'}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={handleCancelEdit}>Cancel</Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-lg font-semibold mb-4">Existing Recipes</h3>
        {loadingRecipes ? (
          <p className="text-muted-foreground">Loading recipes...</p>
        ) : recipes.length === 0 ? (
          <p className="text-muted-foreground">No recipes yet</p>
        ) : (
          <div className="grid gap-3">
            {recipes.map(recipe => (
              <Card key={recipe.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold">{recipe.name}</p>
                      {recipe.description && <p className="text-sm text-muted-foreground">{recipe.description}</p>}
                      <p className="text-xs text-muted-foreground mt-2">{recipe.base_ethanol_volume}L base • {recipe.ingredients?.length || 0} ingredients</p>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(recipe)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate(recipe.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}